var COST = 50;

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

function stripHtml(html) {
  if (typeof DOMParser !== "undefined") {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  }
  else {
    return html.replace(/<\/?[^>]+(>|$)/g, ""); // Removes tags
  }
}

function boldIfNot(text, not) {
  return text === not ? text : '<b>' + text + '</b>';
}

function toOrder(data) {
  var order = [];

  for (var i = 0; i < data.length; i++) {
    var line = data[i];
    order.push({
      "מספר": stripHtml(line["מספר"]),
      "סוג": boldIfNot(stripHtml(line["סוג"]), 'אוטובוס'),
      "שעת התייצבות": stripHtml(line["זמני עצירה"].split('\n')[0]),
      "שם קו": stripHtml(line["שם קו"]),
      "תחנות": stripHtml(line["מיקומי תחנות"]),
      "מוביל": stripHtml(line["מוביל"])
    });
  }

  return order;
}

function log(data) {
  var el = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (el) el.innerHTML = data;
  var log = typeof document !== 'undefined' ? document.getElementById('log') : null;
  if (log) {
    log.appendChild(el);
    log.scrollIntoView(false);
  }
  else {
    console.log(data);
  }
}
function progress(current, total) {
  if (typeof document === 'undefined') {
    try {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`Progress: ${parseInt(current / total * 100)}%`);
    }
    catch {
      console.log(`Progress: ${parseInt(current / total * 100)}%`);
    }
  }
  else {
    var progress = document.getElementById('progress');
    if (progress) {
      progress.style.width = parseInt(current / total * 100) + '%';
      progress.style.backgroundColor = 'lightgreen';
      progress.style.alignSelf = 'flex-start';
      progress.style.padding = '2px';
      progress.style.borderRadius = '10px';
      progress.style.textAlign = 'center';
      progress.style.fontWeight = 'bold';
      progress.innerText = parseInt(current / total * 100) + '%';
    }
  }
}

function cache(key, value) {
  if (typeof sessionStorage === 'undefined') return null;
  if (value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
  else {
    var value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }
}

function findMatchByAction(parent, selector, action, remove, getElement) {
  if (!parent) return '';
  var elements = parent.getElementsByTagName(selector);
  for (var el of elements) {
    if (el.outerHTML.indexOf(action) > 0 && (!remove || (el.innerText || el.textContent).indexOf(remove) > 0)) {
      var innerMatch = findMatchByAction(el, selector, action, remove, getElement);
      if (innerMatch) {
        return innerMatch;
      }

      if (getElement) {
        return el;
      }

      var result = el.innerText || el.textContent;
      if (remove) {
        result = result.replace(remove, '');
      }
      return result.trim();
    }
  }
  return '';
}

function parse(html) {
  if (typeof DOMParser !== "undefined") {
    var parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  }
  else {
    var JSDOM = require('jsdom').JSDOM;
    html = `<!DOCTYPE html><body>${html}</body></html>`;
    return new JSDOM(html).window.document;
  }
}

function whatsappLink(phone, text) {
  phone = phone.replace(/-/g, '').replace(/ /g, '');
  if (phone.startsWith('0')) phone = '+972' + phone.substring(1);
  else if (phone.startsWith('972')) phone = '+' + phone;
  else if (phone.startsWith('5')) phone = '+972' + phone;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function getLineStops(line) {
  var as = parse(line["תחנות"]).getElementsByTagName('a');
  var stops = [];
  for (var j = 0; j < as.length; j++) {
    var stopEl = as[j];
    stops.push({
      name: stopEl.innerText,
      line: line["שם קו"],
      lineNumber: line["מספר"],
      token: stopEl.href.split('t=')[1].split('"')[0],
      busToken: line["קישור ניהול"].split('t=')[1].split('"')[0]
    });
  }
  return stops;
}

function getStopsDetails(url, line) {
  var busToken = getBusToken(line);
  if (!busToken || busToken === '') return Promise.resolve([]);
  var stopsDetails = [];
  var origin = url.split("/").slice(0, 3).join("/");
  let cached = cache(busToken);
  if (cached) return Promise.resolve({line, stops: cached});
  return fetch(origin + "/controller/modals/AJAX_busLocationsModal.php", {
    method: "POST",
    body: new URLSearchParams({ busToken })
  })
  .then(function (response) {
    return response.text().then(function (html) {
      try {
        var doc = parse(html);
        var stops = doc.getElementsByClassName('card-header');

        for (var i = 0; i < stops.length; i++) {
          var stop = stops[i];
          var parent = stop.firstElementChild;
          var city = (parent.firstElementChild.innerText || parent.firstElementChild.textContent).trim();
          var stopName = (parent.lastElementChild.innerText || parent.lastElementChild.textContent).trim();
          
          if (stopName.endsWith('.') || stopName.endsWith(',')) stopName = stopName.substring(0, stopName.length - 1);

          if (stopName.indexOf(city) === -1) {
            stopName = stopName + ', ' + city;
          }

          stopsDetails.push(stopName);
        }

        cache(busToken, stopsDetails);
        return { line, stops: stopsDetails };
      }
      catch (e) {
        console.error("Error parsing HTML:", e);
        log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
      }
    }).catch(function(error) {
      console.error("Error making POST request:", error);
      log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
      log('יותר מדי בקשות. ממתין 30 שניות ומנסה להמשיך...');
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(getStopsDetails(url, line));
        }, 30000);
      });
    });;
  });
}

function getBusToken(line) {
  var num = line["מספר"];
  if (num) {
    return num.split('data-token="')[1].split('"')[0];
  }
  return '';
}

function addStopDetails(url, lines) {
  var calls = [];
  for (var i = 0; i < lines.length; i++) {
    calls.push(getStopsDetails(url, lines[i]).then(function ({ line, stops }) {
      var index = 1;
      line["מיקומי תחנות"] = stops.map(function (stop) {
        return (index++) + '. ' + stop;
      }).join('\r\n<br/>');
      line["שעת התייצבות"] = stripHtml(line["זמני עצירה"].split('\n')[0])
    }));
  }
  return Promise.all(calls).then(function () {
    return lines;
  });
}

function getStops(lines) {
  var stops = [];
  for (var i = 0; i < lines.length; i++) {
    var lineStops = getLineStops(lines[i]);
    stops = stops.concat(lineStops);
  }
  log('נמצאו ' + stops.length + ' תחנות');
  return stops;
}

function getLines(url) {
  //let cached = cache(url);
  //if (cached) return Promise.resolve(cached);
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
          var busToken  = busElement.getAttribute('id');
          var busNumber = (busElement.getElementsByClassName('plate')[0].innerText || busElement.getElementsByClassName('plate')[0].textContent).trim();
          var passengers = findMatchByAction(busElement, 'button', 'openBusJoiner', 'נוסעים');
          var line = findMatchByAction(busElement, 'div', 'fas fa-bus-alt', 'קו');
          var lockedLine = findMatchByAction(busElement, 'div', 'fas fa-lock', 'קו');
          var stops = [];
          var stopsTimes = [];
          for (var a of busElement.getElementsByTagName('a')) {
            if (a.href.indexOf("/eventBus?t=") > 0) {
              var span = a.getElementsByTagName('span')[0];
              stopsTimes.push((span.firstChild.innerText || span.firstChild.textContent).trim());
              stops.push(
                '<a href="' + a.href + '" target="_blank">' + span.lastChild.textContent.trim() + '</a>'
              );
            }
          }
          
          var manageLinkEl = findMatchByAction(busElement, 'a', '/eventBus?t=', null, true);
          var manageLink = manageLinkEl ? '<a href="' + manageLinkEl.href + '" target="_blank">ניהול</a>' : '';
          var registerLinkEl = findMatchByAction(busElement, 'a', '/bus?k=', null, true);
          var registerLink = registerLinkEl ? '<a href="' + registerLinkEl.href + '" target="_blank">רישום</a>' : '';

          var manager = findMatchByAction(busElement, 'div', 'אחראי קו', 'אחראי קו');
          var managerPhone = manager.split(' ');
          managerPhone = managerPhone[managerPhone.length - 1];
          manager = manager.replace(managerPhone, '<a href="' + whatsappLink(managerPhone, 'שלום ' + manager.split(' ')[0] + ', אני מצוות ניהול ההסעות. הוגדרת להובלה על קו ' + (line || lockedLine) + '.\nקישור ניהול: ' + manageLinkEl.href) + '" target="_blank">' + managerPhone + '</a>');
          var waiting = findMatchByAction(busElement, 'button', 'openBusStandbyModal', 'ממתינים');
          var notApproved = findMatchByAction(busElement, 'button', 'openBusNotApprovedModal', 'טרם אושרו');
          var moneyPaid = findMatchByAction(busElement, 'div', 'שולם:', 'שולם:').split('|')[0].trim();
          var seats = findMatchByAction(busElement, 'div', 'מקס׳ מקומות:', 'מקס׳ מקומות:').split('|')[0].trim();
          
          lines.push({
            "מספר": '<div style="font-size: 22pt;" data-token="' + busToken + '">' + busNumber + '</div>',
            "רשומים": passengers <= 1 ? '<div style="background-color: #fff3f3f3; font-size: 20pt;">' + passengers + '</div>' : (
              passengers < 10 ? '<div style="background-color: #ff000070; font-size: 20pt;">' + passengers + '</div>' : (
              passengers < 20 ? '<div style="background-color: #ffa50070; font-size: 20pt;">' + passengers + '</div>' : (
                passengers < 25 ? '<div style="background-color: #ffff0070; font-size: 20pt;">' + passengers + '</div>' : 
                  '<div style="background-color: #00ff0070; font-size: 20pt;">' + passengers + '</div>')
              )
            ),
            "סוג": seats < 2 ? '' : (seats > 20 ? 
              '<div style="background-color: #70cfcf70;">אוטובוס</div>' : (
              '<div style="background-color: #cf70ce7d;">מיניבוס</div>')),
            "מקס' מקומות": seats > 20 ? '<div style="background-color: #70cfcf70;">' + seats + '</div>' : (
              '<div style="background-color: #cf70ce7d;">' + seats + '</div>'),
            "שם קו": line || lockedLine,
            "תחנות": stops.join("\n<br/>"),
            "זמני עצירה": stopsTimes.join("\n<br/>"),
            "מוביל": manager,
            "נעול": lockedLine ? "נעול לרישום" : "",
            "ממתינים": waiting > 0 ? '<div style="background-color: #d3d3d3d3;">' + waiting + '</div>' : "",
            "לא אושרו": notApproved > 0 ? '<div style="background-color: #d3d3d3d3;">' + notApproved + '</div>' : "",
            "שולם": moneyPaid,
            "קישור ניהול": manageLink,
            "קישור רישום": registerLink
          });
        }

        var busNum = function (html) {
          return html ? parseInt(html.replace(/<[^>]+>/g, '')) : 0;
        }

        lines.sort(function (a, b) {
          return busNum(a["מספר"]) - busNum(b["מספר"]);
        });

        log('נמצאו ' + lines.length + ' קווים');
        cache(url, lines);

        return lines;
      }
      catch (e) {
        console.error("Error parsing HTML:", e);
        log('אירעה שגיאה בעת עיבוד המידע: ' + e.message);
      }
    }).then(lines => addStopDetails(url, lines));
  })
  .catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
  });
}

function parseExcel(file) {
  if (!file) {
    console.error("No file provided");
    return Promise.resolve([[]]);
  }
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

          var name = card.getElementsByClassName('card-header')[0].getElementsByTagName('h4')[0].innerText || card.getElementsByClassName('card-header')[0].getElementsByTagName('h4')[0].textContent;
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
      }
    });
  })
  .catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
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
            let el = findMatchByAction(row, 'td', 'openBusJoinerModal', '', true);
            match.deleted = el.innerHTML.indexOf('line-through') > -1;
            match.waiting = row.innerHTML.indexOf('fa-pause-circle') > -1;
            match.token = el.getAttribute('onclick').split("'")[1];
            let payAmountEl = findMatchByAction(row, 'td', 'fad fa-coin', '', true);
            match.paid = payAmountEl ? (payAmountEl.innerText || payAmountEl.textContent).trim() : '0';
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
        passenger["מספר"] = stop.lineNumber;
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
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
  });
}

function readFile(file) {
  return new Promise(function (resolve, reject) {
    if (file) {
      var reader = new FileReader();
      reader.readAsText(file, "UTF-8");
      reader.onload = function (evt) {
        resolve(evt.target.result);
      };
      reader.onerror = function (evt) {
        log('אירעה שגיאה בעת עיבוד המידע: ' + evt.target.error);
        reject(evt.target.error);
      };
    }
    else {
      log('לא נבחר קובץ');
      reject('לא נבחר קובץ');
    }
  });
}

function fixDonors(donors) {
  if (donors.length === 0) return donors;
  else if (donors[0]["Target Name"]) {
    donors = donors.filter(function (donor) {
      return donor && donor["Target Name"] && donor["Target Name"].indexOf('הסעות') >= 0;
    });
  }

  return donors.map(function (donor) {
    delete donor["Target Name"];
    delete donor["Target id"];
    donor["Name"] = donor["Donor First Name"] + " " + donor["Donor Last Name"];
    delete donor["Donor First Name"];
    delete donor["Donor Last Name"];
    donor.Phone = donor["Donor Phone Number"];
    delete donor["Donor Phone Number"];
    if (donor.Phone.startsWith('+972')) {
      donor.Phone = donor.Phone.replace('+972', '0');
    }
    else if (!donor.Phone.startsWith('05')) {
      donor.Phone = '0' + donor.Phone;
    }
    donor.Phone = donor.Phone.replace(/(\d{3})(\d{7})/, '$1-$2');
    donor["Email"] = donor["Donor Email"];
    delete donor["Donor Email"];
    donor["Date"] = donor["Transfer Date"];
    delete donor["Transfer Date"];

    return donor;
  });
}

function moveFromWaiting(origin, joinerToken) {
  return fetch(origin + "/controller/BUS_noStandbyBusJoiner.php", {
    method: "POST",
    body: new URLSearchParams({ joinerToken }),
    referrer: origin
  }).catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
    log('יותר מדי בקשות. ממתין 30 שניות ומנסה להמשיך...');
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(moveFromWaiting(origin, joinerToken));
      }, 30000);
    });
  });
}

function clearPayment(origin, joinerToken) {
  return fetch(origin + "/controller/AJAX_joinerCancelPay.php", {
    method: "POST",
    body: new URLSearchParams({ joinerToken }),
    referrer: origin
  }).catch(function(error) {
    console.error("Error making POST request:", error);
    log('אירעה שגיאה בעת עיבוד המידע: ' + error.message);
    log('יותר מדי בקשות. ממתין 30 שניות ומנסה להמשיך...');
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(clearPayment(origin, joinerToken));
      }, 30000);
    });
  });
}

function markPaid(url, joinerToken, amount) {
  var origin = url.split("/").slice(0, 3).join("/");
  return fetch(origin + "/controller/AJAX_joinerMarkPay.php", {
    method: "POST",
    body: new URLSearchParams({ joinerToken, amount, payTypeID: 4, payVaucher: "JGive (" + amount + "₪)" }),
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
    var quantity = parseInt(Math.round(donor.Amount / COST));
    var matches = passengers.filter(function (p) {
      return p.phone === donor.Phone || (p.email && p.email === donor.Email);
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
        log('נמצאו יותר מדי נוסעים עבור: ' + donor.Name + ' - ' + matches.length + ' נוסעים. מסמן רק ' + quantity);
        matches = matches.slice(0, quantity);
      }

      matches.forEach(function (match) {
        var pamount = matches.length === quantity ? COST : matches.indexOf(match) === 0 ? donor.Amount - (matches.length - 1) * COST : COST;
        if (match.paid >= pamount) {
          donor.Status = "כבר סומן";
          log('כבר סומן עבור: ' + donor.Name);
        }
        else if (match.deleted) {
          donor.Status = "נמחק";
          log('נמחק ולא סומן עבור: ' + donor.Name);
        }
        else if (match.waiting) {
          donor.Status = "ממתין";
          log('ממתין ולא סומן עבור: ' + donor.Name);
        }
        else {
          donor.Status = "נמצא";
          log('נמצא ומסמן תשלום עבור: ' + donor.Name);
          calls.push(function() {
            match.paid = pamount;
            return markPaid(url, match.token, pamount);
          });
        }
      });
    }
    else {
      donor.Status = "לא נמצא";
      log('*** לא נמצא נוסע עבור: ' + donor.Name);
    }
  }
  var index = 0;
  function runNext() {
    if (index < calls.length) {
      return calls[index++]().then(function() {
        progress(index, calls.length);
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
  log('מתחיל תהליך סימון אוטומטי ...');
  return runNext().then(function () {
    if (calls.length) {
      log('הסתיים. בוצעו ' + calls.length + ' קריאות');
      var link = cache('link');
      if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
      cache('link', link);
    }
    else {
      log('הסתיים. לא בוצעו קריאות');
    }
    return donors;
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    toH1,
    toTable,
    stripHtml,
    boldIfNot,
    toOrder,
    log,
    progress,
    cache,
    findMatchByAction,
    parse,
    whatsappLink,
    getLineStops,
    getStopsDetails,
    getBusToken,
    addStopDetails,
    getStops,
    getLines,
    parseExcel,
    getAllPassengers,
    addTokens,
    getPassengers,
    readFile,
    fixDonors,
    markPaid,
    checkPaid,
    moveFromWaiting,
    clearPayment
  };
}