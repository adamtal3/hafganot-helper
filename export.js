const axios = require('axios');
const tough = require('tough-cookie');
const { CookieJar } = tough;
const { wrapper } = require('axios-cookiejar-support');
const csv = require('jquery-csv');
const xlsx = require('xlsx');
const fs = require('fs');

// Enable cookie support for Axios
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

// Log helper
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

let fromDate = new Date();
fromDate.setDate(fromDate.getDate() - 7);

// Function to calculate date range
const formatDate = (date) => date.toISOString().split('T')[0];
const getDateRange = () => {
  return {
    fromDate: formatDate(fromDate),
    toDate: formatDate(new Date()),
  };
};

async function wrapGet(url, params) {
  return new Promise((resolve, reject) => {
    client.get(url, params).then(function (response) {
      resolve(response);
    }).catch(function (error) {
      log(`Error: ${error.message}. Trying again in 5 minutes...`);
      setTimeout(function () {
        wrapGet(url, params);
      }, 300000);
    });
  });
}

async function wrapPost(url, data, params) {
  return new Promise((resolve, reject) => {
    client.post(url, data, params).then(function (response) {
      resolve(response);
    }).catch(function (error) {
      log(`Error: ${error.message}. Trying again in 5 minutes...`);
      setTimeout(function () {
        wrapPost(url, data, params);
      }, 300000);
    });
  });
}

async function processExport(password, targetId) {
  try {
    // Step 1: Authentication to get x-csrf-token
    log('Authenticating...');
    const authResponse = await wrapPost('https://www.jgive.com/graphql', 
      `{\"operationName\":\"SignIn\",\"variables\":{\"type\":\"CharityOrganization\",\"password\":\"${password}\",\"rememberMe\":true,\"charityNumber\":\"580775674\"},\"query\":\"mutation SignIn($charityNumber: String, $email: String, $password: String!, $type: String!, $rememberMe: Boolean, $code: String) {\\n  signIn(\\n    input: {charityNumber: $charityNumber, email: $email, password: $password, type: $type, rememberMe: $rememberMe, code: $code}\\n  ) {\\n    currentAccount {\\n      ... on Account {\\n        id\\n        type\\n        email\\n        name\\n        userId\\n        corporateDonorId\\n        corporateName\\n        employer\\n        primaryDonorId\\n        unclaimedDonors\\n        activeDaf\\n        approvedAt\\n        cardInfos {\\n          id\\n          brand\\n          last4\\n          expirationDate\\n          __typename\\n        }\\n        stripeCardInfos {\\n          id\\n          brand\\n          last4\\n          expirationDate\\n          __typename\\n        }\\n        primaryDonor {\\n          id\\n          firstName\\n          lastName\\n          __typename\\n        }\\n        __typename\\n      }\\n      ... on CharityOrganization {\\n        id\\n        type\\n        email\\n        name\\n        approvedAt\\n        __typename\\n      }\\n      __typename\\n    }\\n    notificationMessage {\\n      alert\\n      notice\\n      __typename\\n    }\\n    __typename\\n  }\\n}\"}`,
      { headers: { "accept": "*/*", "content-type": "application/json", "x-csrf-token": "undefined" }, }
    );

    const csrfToken = authResponse.headers['x-csrf-token'];
    log('Authentication successful');
    log(JSON.stringify(authResponse.data));

    // Step 2: Request export file for the date range (new API structure)
    const dateRange = getDateRange();
    log(`Requesting export file for ${dateRange.fromDate} to ${dateRange.toDate}`);
    const exportResponse = await wrapPost(
      'https://www.jgive.com/graphql',
      {
        operationName: 'RequestDownload',
        variables: {
          downloadType: 'unified_export',
          filter: {
            donationTargetId: `${targetId}`,
            charityDonationTargetsFilter: { withoutMembers: false },
            donationAmountsFilter: {},
            paymentMethodFilter: {},
          },
          dateRange: {
            fromDate: dateRange.fromDate,
            toDate: dateRange.toDate,
          },
        },
        query: `mutation RequestDownload($downloadType: DownloadTypesEnum!, $accountId: ID, $corporateDonorId: ID, $dateRange: DateRangeInput, $filter: DownloadFilterInput, $financialFilter: FinancialFilterEnum) {\n  requestDownload(\n    input: {downloadType: $downloadType, accountId: $accountId, corporateDonorId: $corporateDonorId, filter: $filter, financialFilter: $financialFilter, dateRange: $dateRange}\n  ) {\n    downloadObject {\n      id\n      status\n      __typename\n    }\n    __typename\n  }\n}`,
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

    // New response structure
    const exportId = exportResponse.data.data.requestDownload.downloadObject.id;
    log(`Export request initiated, Export ID: ${exportId}`);

    // Step 3: Poll for export status (new API structure)
    let status = 'processing';
    let fileUrl = null;

    while (status === 'processing') {
      log('Waiting for export...');
      const statusResponse = await wrapPost(
        'https://www.jgive.com/graphql',
        {
          operationName: 'GetDownload',
          variables: {
            id: exportId,
          },
          query: `query GetDownload($id: ID!, $accountId: ID, $corporateDonorId: ID) {\n  getDownload(id: $id, accountId: $accountId, corporateDonorId: $corporateDonorId) {\n    downloadType\n    fileUrl\n    id\n    status\n    __typename\n  }\n}`,
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
      const fileResponse = await wrapGet(fileUrl, { responseType: 'arraybuffer' });

      // Get the file as blob
      const fileContent = Buffer.from(fileResponse.data).toString('utf-8'); // Specify encoding as needed
      var objects = csv.toObjects(fileContent);

      // Filter the following columns only:
      // id, Transaction Date, Amount, Amount, Currency, Donor First Name, Donor Last Name, Invoice Recipient Name, Donor Email, Donor Phone Number, Comment

      var filteredObjects = objects.map(obj => {
        return {
          'Transaction Date': obj['Transaction Date'],
          Amount: obj['Amount'],
          Currency: obj['Currency'],
          'Donor First Name': obj['Donor First Name'],
          'Donor Last Name': obj['Donor Last Name'],
          'Invoice Recipient Name': obj['Invoice Recipient Name'],
          'Donor Email': obj['Donor Email'],
          'Donor Phone Number': obj['Donor Phone Number'],
          Comment: obj['Comment']
        };
      });

      // Convert the filtered objects back to CSV
      const filteredCsv = csv.fromObjects(filteredObjects);
      
      // Now save as xlsx
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(filteredObjects);
      xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
      xlsx.writeFile(wb, 'D:\\jgive-export.xlsx');
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
  const targetId = process.argv[3] || 122602; // Call with node index.js <encoded_password> <buses_url> 122193
  if (!password)
    throw new Error('Password is required as an argument');
  if (process.argv.length > 4) {
    var days = parseInt(process.argv[4]);
    if (days > 0 || process.argv[4] === '0') {
      var today = new Date();
      fromDate = new Date();
      fromDate.setDate(today.getDate() - days); // Calculate X days ago
    }
  }
  await processExport(atob(password), targetId);
})();
