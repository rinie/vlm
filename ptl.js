/* eslint-disable no-param-reassign */
/*
 * ptl
 * nodejs ptl client or simulating server tcp/ip client
 *
 * (c) 2022 Centric
 */

/*
 * Dependencies/Requires
 */
const net = require('net');
const fs = require('fs-extra');
/*
const path = require('path');
const http = require('http');
const https = require('https');
const request = require('request');
const fileset = require('fileset');
*/
const chokidar = require('chokidar');
const readline = require('readline');

const appName = 'ptl';

// used SET DEBUG=* to display all debug messages
// https://stackoverflow.com/questions/18814221/adding-timestamps-to-all-console-messages
// https://github.com/iccicci/rotating-file-stream#readme
const logToFile = (process.argv.length > 4);
if (logToFile) { // all output to stdout?
  const logfileName = (process.argv.length > 4) ? process.argv[4] : `/opt/locus/var/log/${appName}.log`;
  const logFile = fs.createWriteStream(logfileName, { flags: 'as' });
  process.stdout.write = process.stderr.write = logFile.write.bind(logFile);
  console.error(`${appName} stderr log to file use env.SET DEBUG_COLORS=NO`);
}
// console.error(`${appName} stderr log to file`, tty.isatty(process.stderr.fd));
const debug = require('debug');

const debuglog = debug(appName);
const debugs = debug('server');
const debugc = debug('client');
const debugd = debug('data');
const debugdt = debug('detail');
const debugv = debug('vlmother'); // ptl operations
const debugvm = debug('vlmmove'); // ptl operations
// const debugf = debug('file');
// const debugtf = debug('serverfile');
// const debugh = debug('hostcom');
// const debugw = debug('watch');
const debugexit = debug('exit');
/*
 * Startup/Usage: check required parameters for
 * client or server usage
 * Options parameters as .js file...
*/
if (process.argv.length < 4) {
  debuglog(`Usage client: node ${appName}.js c config.js logfile`);
  debuglog(`Usage server: node ${appName}.js s config.js logfile`);
  debuglog(process.argv.length);
  debuglog(process.argv);
  process.exit(1);
}

const isClient = (process.argv[2] === 'c') || (process.argv[2] === 'client');
const isServer = (process.argv[2] === 's') || (process.argv[2] === 'server');

// eslint-disable-next-line import/no-dynamic-require
const options = require(`./${process.argv[3]}`);

// check expected environment
// debugora(`process.env.ORACLE_SID ${process.env.ORACLE_SID}`);
// debugora(`process.env.HCWSFILESEQ ${process.env.HCWSFILESEQ}`);

const baseLength = 8;
const terminator = '\r\n';
const commands = [
  // basic
  { subCommand: 0x00, name: 'ShowText', extraData: 7 },
  { subCommand: 0x01, name: 'ClearText' },
  { subCommand: 0x02, name: 'LedIndicatorOn' },
  { subCommand: 0x03, name: 'LedIndicatorOff' },
  { subCommand: 0x04, name: 'BuzzerOn' },
  { subCommand: 0x05, name: 'BuzzerOff' },
  {
    subCommand: 0x06, name: 'ConfirmButtonText', extraData: 7, fromServer: true,
  },
  {
    subCommand: 0x07, name: 'ShortageButtonText', extraData: 7, fromServer: true,
  },
  { subCommand: 0x0D, name: 'ButtonLocked' },
  { subCommand: 0x10, name: 'FlashText', extraData: 7 },
  { subCommand: 0x11, name: 'FlashLed' },
  { subCommand: 0x13, name: 'ShowTagAddress' },
  { subCommand: 0x19, name: 'SetStockMode' },
  { subCommand: 0x1A, name: 'SetPickingMode' },
];

/*
 * Real processing starts here:
 * - client
 * - server
 * - readline/quit processing and stopindicator
 */
// client webservice to file or hostcom http
let exiting = false;
const openRequestCount = 0;
// common

function getDataLines(data) {
  // run this when data is received
  if (data === undefined || data === null) {
    return data;
  }
  /*
  // const dataString = data.toString().replace(/(\r\n|\n)/gm, '\r'); // normalize to \r
  const dataString = data.toString(); // .replace(/(\r\n|\n)/gm, '\r'); // normalize to \r
  const dataLines = dataString.split(terminator);
  if (dataLines.length > 1 && dataLines[dataLines.length - 1] === '') {
    // zap last if empty
    dataLines.pop();
  }
  debugd('getDataLines', dataLines);
  return dataLines;
*/
  debugd('getDataLines', data); // binary
  return data;
}

// data to command request/response object
function getCommand(dataArgs, isRequest) {
  const errorText = 'OK';

  if (dataArgs.length === 0) { // in case there is no command
    debugd(`getCommand ERROR no data ${dataArgs.length} ${dataArgs}`);
    const cmd = {
      errorText: 'ERROR no data',
    };
    return cmd;
  }
  if (dataArgs.length < 8) { // in case there is no command
    debugd(`getCommand Minimal CCB is 8 ${dataArgs.length} ${dataArgs}`);
    const cmd = {
      errorText: 'MISSING_ID',
    };
    return cmd;
  }
  const ccbLen = dataArgs[0] + dataArgs[1] * 256;
  const messageType = dataArgs[2];
  const subCommand = dataArgs[6];
  const subNode = dataArgs[7];

  const curCmd = commands.find((i) => i.subCommand === subCommand);
  if (curCmd === undefined) {
    debugd(`getCommand command ${subCommand} unknown return BAD_COMMAND data ${dataArgs.length} ${dataArgs}`);
    const cmd = {
      errorText: 'BAD_COMMAND',
    };
    return cmd;
  }
  let checkLength;
  if (curCmd.extraData === undefined) {
    checkLength = baseLength;
  } else {
    checkLength = baseLength + curCmd.extraData;
  }
  if (checkLength !== ccbLen) {
    debugd(`getCommand ${subCommand} insufficient parameters return BAD_PARAMETERS ${checkLength} data ${dataArgs.length} ${dataArgs}`);
    // debugs(`data ${data}`);
    const cmd = {
      errorText: 'BAD_PARAMETERS',
    };
    return cmd;
  }
  const req = {
    ccbLen, messageType, subCommand, subNode, command: curCmd.name,
  };
  /*
    for (let i = 0; i < curCmd.client.length; i++) { // create object with client parameters
      req[curCmd.client[i]] = parameters[i];
    }
    */
  req.errorText = errorText;
  req.curCmd = curCmd;
  debugd(`getCommand command ${subCommand}`, curCmd);
  return req;
}

function createCommand(subCommand, subNode, extraData) {
  const messageType = 0x60;

  const curCmd = commands.find((i) => i.subCommand === subCommand);
  if (curCmd === undefined) {
    debugd(`createCommand command ${subCommand} unknown`);
    return cmd;
  }
  let ccbLen;
  if (curCmd.extraData === undefined) {
    ccbLen = baseLength;
  } else {
    ccbLen = baseLength + curCmd.extraData;
  }
  const packet = Buffer.alloc(ccbLen, 0);
  if (ccbLen > 255) {
    packet[0] = ccbLen % 256;
    packet[1] = ccbLen / 256;
  } else {
    packet[0] = ccbLen;
  }
  packet[2] = messageType;
  packet[6] = subCommand;
  packet[7] = subNode;
  if (extraData !== undefined) {
    for (i = 0; (i < ccbLen - 8) && (i < extraData.length); i++) {
      packet[baseLength + i] = extraData[i];
    }
    debugc(`createCommand name:${curCmd.name} bytes:${ccbLen} subCommand:${subCommand} subNode:${subNode}`, packet);
    return packet;
  }
}

function createCommand7(subCommand, subNode, displayData, dot) {
  const packet = Buffer.alloc(7, 0);
  packet.write(displayData, 0, 6);
  if (dot !== undefined) {
    packet[6] = dot;
  }
  debugc(`createCommand7 subCommand:${subCommand} subNode:${subNode} displayData:${displayData} dot:${dot}`, packet);

  return createCommand(subCommand, subNode, packet);
}

if (isClient) {
  // debuglog(`${appName} client http hostcom serverport:${options.serverPort} https:${options.useHttps} hostcomPostBaseUrl:${options.hostcomPostBaseUrl}`);
  const hostname = options.ptlHostName;
  const host = options.ptlIp;
  const port = options.ptlPort;
  const client = new net.Socket();
  // const locus = new net.Socket();
  // const msgCount = 0;
  debugc(`${appName} client.js Connect to ${hostname} ${host}:${port}`);

  client.connect(port, host, () => {
    debugc(`client connected to ${host}:${port}`);
    // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
    if (options.sendOnce !== null && options.sendOnce !== undefined) {
      debugc(`sendOnce ${options.sendOnce}`);
      client.write(createCommand(options.sendOnce, 0xFC, null));
    }
    const timeout = 5000;
    setTimeout(() => {
      client.write(createCommand(0x01, 0xFC, null)); // all clear
      setTimeout(() => {
        client.write(createCommand(0x02, 0x01, null));
        client.write(createCommand(0x11, 0x02, null));
        client.write(createCommand7(0x0, 0x03, '123456', 0));
        client.write(createCommand7(0x10, 0x04, 'FULL  ', 0));
        client.write(createCommand7(0x10, 0x05, '  FULL', 0));
      }, timeout);
    }, timeout);
    /*
    getStatus('101');
    displayClear('101');
    displayShow('101', 'Hoi', 10, 1);
    callTray('101', 13, 1);
    getStatus('101');
    getStatus('111');
    getStatus('101');
*/
    // initStatus();
  });
  client.on('data', (data) => {
    const dataLines = getDataLines(data);
    if (dataLines === undefined || dataLines === null) {
      return;
    }
    //    for (const dataLine of dataLines) {
    const resp = getCommand(dataLines, false);
    debugdt('Response', resp);
    // processResponse(resp);
    //    }
  });
  client.on('close', () => {
    debugc(`Client close ${hostname} ${host}:${port}`);
    waitExit();
  });
  client.on('timeout', () => {
    debugc(`Client timeout ${hostname} ${host}:${port}`);
    waitExit();
  });
  client.on('error', (err) => {
    debugc(`Client error ${hostname} ${host}:${port} ${err}`);
    waitExit();
  });

  /*
   * End of client part
   */
}
if (isServer) {
  /*
   * Start of server part
   */
  function handleProtocol(req) {
    const errorText = 'OK';
    const result = req.version === '2.0' ? 0 : 1;
    const resp = {
      errorText, prefix: req.prefix, requestId: req.requestId, command: req.command.toUpperCase(), version: '2.0', result,
    };
    return resp;
  }

  const port = options.ptlPort;
  debuglog(`${appName} server ${options.ptlPort}`);
  // Something to use when events are received.
  // const log = debuglog.bind(console);
  const server = net.createServer((connection) => {
  // 'connection' listener.
    const remoteAddress = `${connection.remoteAddress}:${connection.remotePort}`;
    debugs(`client connected ${remoteAddress}`);
    connection.on('data', (data) => {
      const dataLines = getDataLines(data);
      if (dataLines === undefined || dataLines === null) {
        return;
      }
      //      for (const dataLine of dataLines) {
      const req = getCommand(dataLines, true);

      debugdt('Request ', req);
      // console.log('req ', req);
      if (req.errorText !== 'OK') {
        // connection.write(req.errorText + terminator);
        return;
      }
      // lookup handler function
      const fn = undefined;
      if (fn === undefined) {
        debugs(`NO_HANDLER_IMPLEMENTED:${req.command}`);
        // connection.write(`NO_HANDLER_IMPLEMENTED:${req.command}\r`);
        return;
      }

      const resp = fn.fn(req);
      // debugs('resp ', resp);
      // console.log('resp ', resp);

      if (resp.errorText === 'OK') {
        let response = `${resp.prefix}|${resp.requestId}|${resp.command}`;
        for (let i = 0; i < req.curCmd.server.length; i++) { // create object with client parameters
          response += `|${resp[req.curCmd.server[i]]}`;
        }
        debugs(`Response OK ${response}`);
        debugdt(resp);
        response += terminator;
        // connection.write(response);
      } else {
        debugs(`Response error ${resp.errorText}`);
        debugdt(resp);
        // connection.write(resp.errorText + terminator);
      }
    });
    connection.on('error', (err) => {
      debugs('client error', err);
    });
    connection.on('end', () => {
      debugs('client disconnected');
    });
    // connection.write('hello\r\n');
    // connection.pipe(connection);
  });
  server.on('error', (err) => {
    debugs('Error', err);
    // throw err;
  });
  server.listen(port, () => {
    debugs('server bound');
  });
}
/*
 * End of server part
 * Start of readline/stopindicator part
 * and reload/exit interval
 */
// readline exit code...
debuglog('q or SIGINT/ctrl-c exits. Use set DEBUG=*,-detail,-client to view debug info');
let timerCount = 0;

function waitExit() {
  timerCount = 0;
  if (!exiting) {
    debugexit(`waitExit openRequestCount ${openRequestCount}`);
    exiting = true;
    if (openRequestCount <= 0) {
      process.exit();
    }
    setInterval(() => {
      timerCount += 1;
      debugexit(`waitExit Interval openRequestCount ${openRequestCount} ${timerCount}`);
      if (openRequestCount <= 0 || timerCount >= 30) {
        process.exit();
      }
    }, 1000);
  }
}

// stopInicator watcher.
let stopIndicators = [];
if (isClient) {
  if (options.removeStopIndicatorOnStart) {
    debugexit(`watched removeStopIndicatorOnStart ${options.clientStopIndicator}`);
    fs.removeSync(options.clientStopIndicator);
  }
  stopIndicators = [options.clientStopIndicator.toLowerCase(), options.clientStopIndicator.toUpperCase()];
}
if (isServer) {
  if (options.removeStopIndicatorOnStart) {
    debugexit(`watched removeStopIndicatorOnStart ${options.serverStopIndicator}`);
    fs.removeSync(options.serverStopIndicator);
  }
  stopIndicators = stopIndicators.concat([options.serverStopIndicator.toLowerCase(), options.serverStopIndicator.toUpperCase()]);
}
debugexit(`watched StopIndicators${stopIndicators}`);

const watchStopIndicator = chokidar.watch(stopIndicators, {
  ignored: /(^|[/\\])\../, // ignore dotfiles
  ignoreInitial: false, // only new files
  persistent: true,
});
watchStopIndicator
  .on('add', (fpath) => {
    debugexit(`exits on StopIndicator add ${fpath} -> waitExit`);
    waitExit();
  });

// interval reload code
const interval15minutes = 15 * 60 * 1000;
const reloadCheckInterval = options.reloadInterval < interval15minutes ? options.reloadInterval : interval15minutes;
debugexit(`reloadCheckInterval check ${reloadCheckInterval} reload ${options.reloadInterval}`);
const startTime = Date.now();
const startHour = new Date().getHours();

setInterval(() => {
  const nowHour = new Date().getHours();
  const checkintervaltime = Date.now() - startTime;
  debugexit(`reloadcheckinterval check nowHour=${nowHour} startHour=${startHour} checkintervaltime=${checkintervaltime} options.reloadinterval=${options.reloadinterval}`);
  if (nowHour < startHour) {
    debugexit(`exits on reloadCheckInterval daychange ${nowHour} <  ${startHour}`);
    waitExit();
  }
  if (checkintervaltime > options.reloadInterval) {
    debugexit('exits on reloadCheckInterval expired');
    waitExit();
  }
}, reloadCheckInterval);

// ctrl c/q quit code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

rl.on('SIGINT', () => {
  debugexit('q or SIGINT/ctrl-c exits');
  process.exit(); // forced stop, dont wait
});

process.stdin.on('keypress', (str, key) => {
  if (key.name === 'q' || key.name === 'Q') {
    debugexit('exits on keypress q');
    waitExit();
  } else {
    debuglog(`You pressed the "${str}" key`);
    debuglog();
    debuglog(key);
    debuglog();
  }
});
