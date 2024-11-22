const axios = require('axios');
const tough = require('tough-cookie');
const { CookieJar } = tough;
const { wrapper } = require('axios-cookiejar-support');
const $ = require('jquery');
const csv = require('jquery-csv');
const { fixDonors, getLines, getStops, getPassengers, checkPaid } = require("./app.js");

const GetLastMonday = () => {
  const today = new Date();
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Calculate last Monday
  return lastMonday;
}
var lastRun = GetLastMonday();

// Enable cookie support for Axios
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

// Log helper
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

// Function to calculate date range (last Monday to today)
const formatDate = (date) => date.toISOString().split('T')[0];
const getDateRange = () => {
  return {
    fromDate: formatDate(lastRun),
    toDate: formatDate(new Date()),
  };
};

function markPayers(text, url) {
  var donors = csv.toObjects(text);
  donors = fixDonors(donors);

  return getLines(url).then(function (lines) {
    var stops = getStops(lines);
    return getPassengers(url, stops).then(function (passengers) {
      return checkPaid(url, donors, passengers);
    });
  });
}

async function processExport(password, url) {
  try {
    // Step 1: Authentication to get x-csrf-token
    log('Authenticating...');
    const authResponse = await client.post('https://www.jgive.com/graphql', 
      `{\"operationName\":\"SignIn\",\"variables\":{\"type\":\"CharityOrganization\",\"password\":\"${password}\",\"rememberMe\":true,\"charityNumber\":\"12580586998\"},\"query\":\"mutation SignIn($charityNumber: String, $email: String, $password: String!, $type: String!, $rememberMe: Boolean, $code: String) {\\n  signIn(\\n    input: {charityNumber: $charityNumber, email: $email, password: $password, type: $type, rememberMe: $rememberMe, code: $code}\\n  ) {\\n    currentAccount {\\n      ... on Account {\\n        id\\n        type\\n        email\\n        name\\n        userId\\n        corporateDonorId\\n        corporateName\\n        employer\\n        primaryDonorId\\n        unclaimedDonors\\n        activeDaf\\n        approvedAt\\n        cardInfos {\\n          id\\n          brand\\n          last4\\n          expirationDate\\n          __typename\\n        }\\n        stripeCardInfos {\\n          id\\n          brand\\n          last4\\n          expirationDate\\n          __typename\\n        }\\n        primaryDonor {\\n          id\\n          firstName\\n          lastName\\n          __typename\\n        }\\n        __typename\\n      }\\n      ... on CharityOrganization {\\n        id\\n        type\\n        email\\n        name\\n        approvedAt\\n        __typename\\n      }\\n      __typename\\n    }\\n    notificationMessage {\\n      alert\\n      notice\\n      __typename\\n    }\\n    __typename\\n  }\\n}\"}`,
      { headers: { "accept": "*/*", "content-type": "application/json", "x-csrf-token": "undefined" }, }
    );

    const csrfToken = authResponse.headers['x-csrf-token'];
    log('Authentication successful');
    log(JSON.stringify(authResponse.data));

    // Step 2: Request export file for the date range
    const dateRange = getDateRange();
    log(`Requesting export file for ${dateRange.fromDate} to ${dateRange.toDate}`);
    const exportResponse = await client.post(
      'https://www.jgive.com/graphql',
      {
        operationName: 'RequestDownload',
        variables: {
          downloadType: 'unified_export',
          financialFilter: null,
          filter: {
            donationTargetId: '122602',
            paymentMethodFilter: {},
          },
          charityOrganizationId: '4352',
          dateRange,
        },
        query: `mutation RequestDownload($downloadType: DownloadTypesEnum!, $accountId: ID, $corporateDonorId: ID, $charityOrganizationId: ID, $dateRange: DateRangeInput, $filter: DownloadFilterInput, $financialFilter: FinancialFilterEnum) {
          requestDownload(input: {downloadType: $downloadType, accountId: $accountId, corporateDonorId: $corporateDonorId, charityOrganizationId: $charityOrganizationId, filter: $filter, financialFilter: $financialFilter, dateRange: $dateRange}) {
            downloadObject {
              id
              status
            }
          }
        }`,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || 'undefined',
        },
      }
    );


    log(JSON.stringify({data:exportResponse.data}));

    if (exportResponse.data.errors && exportResponse.data.errors.length > 0) {
      log('Export request failed with errors: ' + JSON.stringify(exportResponse.data.errors));
      throw new Error("Export request failed with errors: " + JSON.stringify(exportResponse.data.errors));
    }
    
    const exportId = exportResponse.data.data.requestDownload.downloadObject.id;
    log(`Export request initiated, Export ID: ${exportId}`);

    // Step 3: Poll for export status
    let status = 'processing';
    let fileUrl = null;

    while (status === 'processing') {
      log('Waiting for export...');
      const statusResponse = await client.post(
        'https://www.jgive.com/graphql',
        {
          operationName: 'GetDownload',
          variables: {
            id: exportId,
            charityOrganizationId: '4352',
          },
          query: `query GetDownload($id: ID!, $charityOrganizationId: ID) {
            getDownload(id: $id, charityOrganizationId: $charityOrganizationId) {
              downloadType
              fileUrl
              id
              status
            }
          }`,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken || 'undefined',
          },
        }
      );

      const statusData = statusResponse.data.data.getDownload;
      status = statusData.status;
      fileUrl = statusData.fileUrl;

      if (status === 'success' || status === 'completed') {
        log('Export completed successfully');
        break;
      } else if (status !== 'processing') {
        throw new Error(`Export failed with status: ${status}`);
      }

      // Wait 10 seconds before the next poll
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    // Step 4: Fetch the CSV file
    if (fileUrl) {
      log(`Fetching the CSV file from ${fileUrl}`);
      const fileResponse = await client.get(fileUrl, { responseType: 'arraybuffer' });

      // Get the file as blob
      const fileContent = Buffer.from(fileResponse.data).toString('utf-8'); // Specify encoding as needed
      markPayers(fileContent, url).then(function (donors) {
        // Run again in 1 hour
        log(`Done processing ${donors.length} donors - waiting for 1 hour before running again`);
        lastRun = new Date();
        setTimeout(() => processExport(password, url), 3600000);
      });
    } else {
      throw new Error('File URL not found');
    }
  } catch (error) {
    log(`Error: ${error.message}`);
    console.error('Error:', error.message);
  }
}

// Example usage
(async () => {
  // Get password from argument
  const password = process.argv[2];
  const url = process.argv[3]; // Call with node index.js <encoded_password> <buses_url>
  if (!password)
    throw new Error('Password is required as an argument');
  await processExport(atob(password), url);
})();
