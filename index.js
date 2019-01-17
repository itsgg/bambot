const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const strftime = require('strftime');
const schedule = require('node-schedule');

require('dotenv').config();

const app = express();

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.listen(process.env.PORT || 3000, function () {
  console.log('Server started...');
});

app.get('/', function (req, res) {
  res.send('bombot active!');
});

app.get('/oauth', function (req, res) {
  if (!req.query.code) {
    res.status(500);
    res.send({
      error: 'code is required'
    });
    return;
  }

  request({
    url: 'https://slack.com/api/oauth.access',
    qs: {
      code: req.query.code,
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
    },
    method: 'GET'
  }, function (error, response, body) {
    if (error) {
      console.log(error);
    } else {
      res.json(body);
    }
  });
});

const today = strftime('%Y-%m-%d', (new Date()));

function parseData(callback) {
  request(`${process.env.API_END_POINT}time_off/whos_out?end=${today}&start=${today}`, {
    auth: {
      user: process.env.BAMBOOHR_USERNAME,
      pass: process.env.BAMBOOHR_PASSWORD,
      sendImmediately: false
    },
    json: true
  }, function (error, _res, body) {
    callback(error, body);
  });
}

function whosOut(callback) {
  let text;

  parseData((error, content) => {
    if (error) {
      text = 'Error communicating with BambooHR';
    }

    const outs = content.filter((item) => {
      return item.type === 'timeOff';
    });

    if (outs.length === 0) {
      text = 'Nobody is out!';
    } else {
      text = `*Who's out:* ${outs.map((out) => {
        return out.name;
      }).join(', ')}`;
    }
    callback(text);
  });
}

function holidays(callback) {
  let text;
  parseData((error, content) => {
    if (error) {
      text = 'Error communicating with BambooHR';
    }

    const holidays = content.filter((item) => {
      return item.type === 'holiday';
    });

    let text;
    if (holidays.length === 0) {
      text = 'No holidays today!';
    } else {

      text = `*Holiday's today:* ${holidays.map((holiday) => {
                                            return holiday.name;
                                          }).join(', ')}`
    }
    callback(text);
  });
}

var j = schedule.scheduleJob(process.env.CRON_PATTERN, () => {
  whosOut((text) => {
    request({
      uri: process.env.SLACK_INCOMING_WEBHOOK,
      method: 'POST',
      json: {
        text: text,
        mrkdwn: true
      },
    });
  });
  holidays((text) => {
    request({
      uri: process.env.SLACK_INCOMING_WEBHOOK,
      method: 'POST',
      json: {
        text: text,
        mrkdwn: true
      },
    });
  });
});


app.post('/command', function (req, res, next) {
  res.send({
    text: '*bambot* processing...',
    mrkdwn: true
  });
  const responseUrl = req.body.response_url;
  let showHelp = () => {
    request({
      uri: responseUrl,
      method: 'POST',
      json: {
        text: '*Supported commands*: _holiday_ _out_ _help_',
        mrkdwn: true
      },
    });
  }
  const command = req.body.text;

  switch (command) {
    case "help":
      showHelp();
    case 'out':
      whosOut((text) => {
        request({
          uri: responseUrl,
          method: 'POST',
          json: {
            text: text,
            mrkdwn: true
          },
        });
      });
      break;
    case 'holiday':
      holidays((text) => {
        request({
          uri: responseUrl,
          method: 'POST',
          json: {
            text: text,
            mrkdwn: true
          },
        });
      });
      break;
    default:
      showHelp();
      break;
  }
});
