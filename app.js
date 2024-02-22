
function toH1(text) {
  var h1 = document.createElement('h1');
  h1.appendChild(document.createTextNode(text));
  return h1;
}
function toTable(data) {
  if (!data) return document.createElement('span');
  var table = document.createElement('table');
  var thead = document.createElement('thead');
  var tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);

  var th = document.createElement('tr');
  for (var key in data[0]) {
    var td = document.createElement('th');
    td.appendChild(document.createTextNode(key));
    th.appendChild(td);
  }
  thead.appendChild(th);

  for (var i = 0; i < data.length; i++) {
    var tr = document.createElement('tr');
    for (var key in data[i]) {
      var td = document.createElement('td');
      td.innerHTML = data[i][key];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  return table;
}

function log(data) {
  var el = document.createElement('div');
  el.innerHTML = data;
  var log = document.getElementById('log');
  if (log) {
    log.insertBefore(el, log.firstChild);
  }
  else {
    console.log(data);
  }
}

function cache(key, value) {
  if (value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
  else {
    var value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }
}

function findMatchByAction(parent, selector, action, remove, getElement) {
  var elements = parent.getElementsByTagName(selector);
  for (var el of elements) {
    if (el.outerHTML.indexOf(action) > 0 && (!remove || el.innerText.indexOf(remove) > 0)) {
      var innerMatch = findMatchByAction(el, selector, action, remove, getElement);
      if (innerMatch) {
        return innerMatch;
      }

      if (getElement) {
        return el;
      }

      var result = el.innerText;
      if (remove) {
        result = result.replace(remove, '');
      }
      return result.trim();
    }
  }
  return '';
}

function parse(html) {
  var parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function getLines(url) {
  let cached = cache(url);
  if (cached) return Promise.resolve(cached);
  var eventBusesAdminToken = url.split("?")[1].split("&").find(function(param) { return param.split("=")[0] === "t"; }).split("=")[1];
  var origin = url.split("/").slice(0, 3).join("/");
  return fetch(origin + "/controller/AJAX_eventBuses.php", {
    method: "POST",
    body: new URLSearchParams({ eventBusesAdminToken })
  })
  .then(function (response) {
    return response.text().then(function (html) {
      try {
        var doc = parse(html);
        var buses = doc.getElementById('buses');
        var busElements = buses.getElementsByClassName('list-group-item');
        var lines = [];

        for (var i = 0; i < busElements.length; i++) {
          var busElement = busElements[i];
          var busNumber = busElement.getElementsByClassName('plate')[0].innerText;
          var passengers = findMatchByAction(busElement, 'button', 'openBusJoiner', 'נוסעים');
          var line = findMatchByAction(busElement, 'div', 'fas fa-bus-alt', 'קו');
          var lockedLine = findMatchByAction(busElement, 'div', 'fas fa-lock', 'קו');
          var stops = [];
          var stopsTimes = [];
          for (var a of busElement.getElementsByTagName('a')) {
            if (a.href.indexOf("/eventBus?t=") > 0) {
              var span = a.getElementsByTagName('span')[0];
              stopsTimes.push(span.firstChild.innerText.trim());
              stops.push(
                '<a href="' + a.href + '" target="_blank">' + span.lastChild.textContent.trim() + '</a>'
              );
            }
          }
          var manager = findMatchByAction(busElement, 'div', 'אחראי קו', 'אחראי קו');
          var waiting = findMatchByAction(busElement, 'button', 'openBusStandbyModal', 'ממתינים');
          var notApproved = findMatchByAction(busElement, 'button', 'openBusNotApprovedModal', 'טרם אושרו');
          var moneyPaid = findMatchByAction(busElement, 'div', 'שולם:', 'שולם:').split('|')[0].trim();
          
          var manageLinkEl = findMatchByAction(busElement, 'a', '/eventBus?t=', null, true);
          var manageLink = manageLinkEl ? '<a href="' + manageLinkEl.href + '" target="_blank">ניהול</a>' : '';
          var registerLinkEl = findMatchByAction(busElement, 'a', '/bus?k=', null, true);
          var registerLink = registerLinkEl ? '<a href="' + registerLinkEl.href + '" target="_blank">רישום</a>' : '';

          lines.push({
            "מספר אוטובוס": busNumber,
            "מספר נוסעים": passengers,
            "שם קו": line || lockedLine,
            "תחנות": stops.join("\n<br/>"),
            "זמני עצירה": stopsTimes.join("\n<br/>"),
            "מנהל": manager,
            "נעול": lockedLine ? "נעול לרישום" : "",
            "ממתינים": waiting,
            "לא אושרו": notApproved,
            "שולם": moneyPaid,
            "קישור ניהול": manageLink,
            "קישור רישום": registerLink
          });
        }

        log('נמצאו ' + lines.length + ' קווים');
        cache(url, lines);

        return lines;
      }
      catch (e) {
        console.error("Error parsing HTML:", e);
        log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
        alert('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
      }
    });
  })
  .catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
    alert('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
  });
}

function parseExcel(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var data = e.target.result;
      var workbook = XLSX.read(data, { type: 'binary' });
      var result = [];
      workbook.SheetNames.forEach(function(sheetName) {
        var XL_row_object = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
        result.push(XL_row_object);
      })
      resolve(result);
    };
    reader.onerror = function(error) {
      console.error("Error making POST request:", error);
      log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
      reject(error);
    };
    reader.readAsBinaryString(file);
  });
};

function getAllPassengers(referrer, eventBusesAdminToken) {
  var origin = referrer.split("/").slice(0, 3).join("/");
  var url = origin + "/controller/BUS_searchBusesJoinersData.php";
  let cached = cache(url);
  if (cached) return Promise.resolve(cached);
  return fetch(url, {
    method: "POST",
    referrer,
    body: new URLSearchParams({ eventBusesAdminToken, search: '05' })
  })
  .then(function (response) {
    return response.text().then(function (html) {
      try {
        var doc = parse(html);
        var cards = doc.getElementsByClassName('card');
        var passengers = [];

        for (var i = 0; i < cards.length; i++) {
          var card = cards[i];

          var name = card.getElementsByClassName('card-header')[0].getElementsByTagName('h4')[0].innerText;
          var phone = findMatchByAction(card, 'a', 'tel:', null, false, card);
          var email = findMatchByAction(card, 'a', 'mailto:', null, false, card);
          var stopTokenEl = findMatchByAction(card, 'a', 'eventBus?t=', null, true, card);
          var stopToken = stopTokenEl.href.split('t=')[1].split('"')[0];
          
          passengers.push({ name, phone, email, stopToken });
        }

        cache(url, passengers);
        return passengers;
      }
      catch (e) {
        console.error("Error parsing HTML:", e);
        log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
        alert('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
      }
    });
  })
  .catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
    alert('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
  });
}

function addTokens(url, passengers) {
  var origin = url.split("/").slice(0, 3).join("/");
  var stopTokens = [];
  for (var i = 0; i < passengers.length; i++) {
    var passenger = passengers[i];
    if (stopTokens.indexOf(passenger.stopToken) === -1) {
      stopTokens.push(passenger.stopToken);
    }
  }

  function runNext(index) {
    var stopToken = stopTokens[index];
    function callback(html, fromCache) {
      var doc = parse(html);
      var tables = doc.getElementsByTagName('table');
      for (var i = 0; i < tables.length; i++) {
        var table = tables[i];
        var rows = table.getElementsByTagName('tr');
        for (var j = 1; j < rows.length; j++) {
          var row = rows[j];
          var match = passengers.find(function (p) { return p.stopToken === stopToken && row.innerHTML.indexOf(p.phone) > 0 && row.innerHTML.indexOf(p.name) >= 0; });
          if (match) {
            match.token = findMatchByAction(row, 'td', 'openBusJoinerModal', '', true).getAttribute('onclick').split("'")[1];
            let payAmountEl = findMatchByAction(row, 'td', 'fad fa-coin', '', true);
            match.paid = payAmountEl ? payAmountEl.innerText.trim() : '0';
          }
        }
      }
      if (index < stopTokens.length - 1) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            resolve(runNext(index + 1));
          }, fromCache ? 0 : 2500);
        });
      }
    }
    let cached = cache(stopToken);
    if (cached) return callback(cached, true);
    log('מציאת נוסעים לתחנה: ' + (index + 1) + ' מתוך ' + stopTokens.length);
    return fetch(origin + "/controller/BUS_locationJoinersData.php", {
        referrer: url,
        method: "POST",
        body: new URLSearchParams({ locationToken: stopToken })
      }).then(function (response) {
        return response.text().then(function (html) {
          cache(stopToken, html);
          return callback(html);
        });
      }).catch(function(error) {
        console.error("Error making POST request:", error);
        log('אירעה שגיאה בקבלת נוסעים לתחנה: ' + error.message);
        log('יותר מדי בקשות. ממתין 30 שניות ומנסה להמשיך...');
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            resolve(runNext(index));
          }, 30000);
        });
      });
  }
  return runNext(0).then(function () {
    return passengers;
  });
}

var getPassengers = function (url, stops) {
  var eventBusesAdminToken = url.split("?")[1].split("&").find(function(param) { return param.split("=")[0] === "t"; }).split("=")[1];

  return getAllPassengers(url, eventBusesAdminToken).then(function (passengers) {
    if (!passengers) return passengers;
    for (var i = 0; i < passengers.length; i++) {
      var passenger = passengers[i];
      var stop = stops.find(function (s) {
        return s.token === passenger.stopToken;
      });
      if (stop) {
        passenger["מספר אוטובוס"] = stop.lineNumber;
        passenger["שם קו"] = stop.line;
        passenger["תחנה"] = stop.name;
        passenger.busToken = stop.busToken;
        passenger.token = '';
        passenger.paid = 0;
      }
    }
    return addTokens(url, passengers);
  })
  .catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
    alert('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
  });
}

function getStops(lines) {
  var stops = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    var as = parse(line["תחנות"]).getElementsByTagName('a');
    for (var j = 0; j < as.length; j++) {
      var stopEl = as[j];
      stops.push({
        name: stopEl.innerText,
        line: line["שם קו"],
        lineNumber: line["מספר אוטובוס"],
        token: stopEl.href.split('t=')[1].split('"')[0],
        busToken: line["קישור ניהול"].split('t=')[1].split('"')[0]
      });
    }
  }
  log('נמצאו ' + stops.length + ' תחנות');
  return stops;
}

function fixDonors(donors) {
  return donors.map(function (donor) {
    delete donor["Target Name"];
    delete donor["Target id"];
    donor["Name"] = donor["Donor First Name"] + " " + donor["Donor Last Name"];
    delete donor["Donor First Name"];
    delete donor["Donor Last Name"];
    donor["Phone"] = '0' + donor["Donor Phone Number"];
    donor.Phone = donor.Phone.replace(/(\d{3})(\d{7})/, '$1-$2');
    delete donor["Donor Phone Number"];
    donor["Email"] = donor["Donor Email"];
    delete donor["Donor Email"];
    donor["Date"] = donor["Transfer Date"];
    delete donor["Transfer Date"];

    return donor;
  });
}

function markPaid(url, joinerToken, amount) {
  var origin = url.split("/").slice(0, 3).join("/");
  var amount = 30;
  return fetch(origin + "/controller/AJAX_joinerMarkPay.php", {
    method: "POST",
    body: new URLSearchParams({ joinerToken, amount: 30, payTypeID: 4, payVaucher: "JGive (" + amount + "₪)" }),
  }).catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
    log('יותר מדי בקשות. ממתין 30 שניות ומנסה להמשיך...');
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(markPaid(url, joinerToken, amount));
      }, 30000);
    });
  });
}

function checkPaid(url, donors, passengers) {
  var calls = [];
  for (var i = 0; i < donors.length; i++) {
    var donor = donors[i];
    log('סנכרון תשלום עבור: ' + (i + 1) + ' מתוך ' + donors.length + ' - ' + donor.Name + ' - ' + donor.Amount + '₪');
    var quantity = parseInt(donor.Amount / 30);
    var matches = passengers.filter(function (p) {
      return p.phone === donor.Phone;
    });
    if (matches.length === 0) {
      log('לא נמצא נוסע עבור: ' + donor.Phone + ' מחפש לפי שם: ' + donor.Name);
      matches = passengers.filter(function (p) {
        return p.name === donor.Name;
      });
    }
    if (matches.length) {
      if (matches.length > quantity) {
        donor.Status = "נמצאו יותר מדי נוסעים";
        log('נמצאו יותר מדי נוסעים עבור: ' + donor.Name);
      }
      else {
        matches.forEach(function (match) {
          if (match.paid > 0) {
            donor.Status = "כבר סומן";
            log('כבר סומן עבור: ' + donor.Name);
          }
          else {
            donor.Status = "נמצא";
            log('נמצא ומסמן תשלום עבור: ' + donor.Name);
            calls.push(function() {
              match.paid = 30;
              return markPaid(url, match.busToken, match.token, 30);
            });
          }
        });
      }
    }
    else {
      donor.Status = "לא נמצא";
      log('לא נמצא נוסע עבור: ' + donor.Name);
    }
  }
  var index = 0;
  function runNext() {
    if (index < calls.length) {
      return calls[index++]().then(function() {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            resolve(runNext());
          }, 2500);
        });
      });
    }
    else {
      return Promise.resolve(donors);
    }
  }
  return runNext().then(function () {
    if (calls.length) {
      log('הסתיים. בוצעו ' + calls.length + ' קריאות');
      var link = cache('link');
      //sessionStorage.clear(); // TODO: Uncomment
      cache('link', link);
    }
    else {
      log('הסתיים. לא בוצעו קריאות');
    }
    return donors;
  });
}