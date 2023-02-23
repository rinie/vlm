/* eslint-disable no-param-reassign */
/*
 * vlm
 * nodejs vlm client or simulating server tcp/ip client
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

const appName = 'vlm';

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
const debugv = debug('vlmother'); // vlm operations
const debugvm = debug('vlmmove'); // vlm operations
// const debugf = debug('file');
// const debugtf = debug('serverfile');
// const debugh = debug('hostcom');
// const debugw = debug('watch');
const debugexit = debug('exit');
var trayCount = 0;
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


const separator = '|';
const terminator = '\r';
const commands = [
  {
    name: 'PROTOCOL', client: ['version'], server: ['version', 'result'], bayMachinePrefix: false,
  },
  // 61|6|STATUS|3|0|0|0|0|0
  { name: 'STATUS', client: [], server: ['status', 'pos1PickTray', 'pos2PickTray', 'pos1ExeTray', 'pos2ExeTray', 'errorCode' /*, 'pos1OnePickTray' */] },
  { name: 'CALL', client: ['tray', 'position'], server: ['result'] },
  { name: 'RETURN', client: ['position'], server: ['result'] },
  // laser
  { name: 'LASER_ON', client: [], server: ['result'] },
  { name: 'LASER_OFF', client: [], server: ['result'] },
  { name: 'LASER_HOME', client: [], server: ['result'] },
  { name: 'LASER_GO', client: ['position', 'x', 'y'], server: ['result'] },
  { name: 'LASER_STATUS', client: [], server: ['status', 'position', 'x', 'y'] },
  // display/graphical led bar
  { name: 'DISPLAY_CLEAR', client: [], server: ['result'] },
  { name: 'DISPLAY_SHOW', client: ['message', 'col', 'arrow'], server: ['result'] },
  // PTL general not bay related
  {
    name: 'PTL_SHOW_QTA', client: ['idDisplay', 'qta', 'color'], server: ['result'], bayMachinePrefix: false,
  },
  {
    name: 'PTL_SHOW_MESSAGE', client: ['idDisplay', 'message', 'color'], server: ['result'], bayMachinePrefix: false,
  },
  {
    name: 'PTL_CLEAR', client: ['idDisplay'], server: ['result'], bayMachinePrefix: false,
  },
  {
    name: 'PTL_CLEAR_ALL', client: [], server: ['result'], bayMachinePrefix: false,
  },
  {
    name: 'PTL_STATUS', client: [], server: ['status'], ptlStatus: ['idDisplay', 'qta', 'message', 'color', 'operationConfirmed'], bayMachinePrefix: false,
  },
  // exchange Load Unit Exchange
  { name: 'EXCHANGE', client: [], server: ['result'] },
  // simple ledbar
  { name: 'LEDBAR_LIGHT', client: ['ledX', 'ledY', 'ledOrder'], server: ['result'] },
  { name: 'LEDBAR_LIGHT_OFF', client: [], server: ['result'] },
  // trolley management?
  { name: 'EXTRACTION', client: ['tray', 'position'], server: ['result'] },
  { name: 'ENDEXTRACTION', client: ['tray', 'position'], server: ['result'] },
  { name: 'INSERTION', client: ['tray', 'position'], server: ['result'] },
  { name: 'ENDINSERTION', client: ['tray', 'position', 'sideHeight'], server: ['result'] },
];

// pod is carousel group and then within a deviceId...
const podCommands = [
  // carousel podId|deviceId|requestId
  { name: 'CALL_BIN', client: ['bin'], server: ['result'] },
  { name: 'STATUS_BIN', client: [], server: ['status', 'binPick', 'binExe', 'doorStatus'] },
  { name: 'END_BIN', client: [], server: ['result'] },
  { name: 'DOOR_OPEN', client: [], server: ['result'] },
  { name: 'DOOR_CLOSE', client: [], server: ['result'] },
  {
    name: 'RGB_CLEAR', client: ['side'], server: ['result'], podCommand: true,
  },
  { name: 'RGB_SHOW', client: ['color', 'blink', 'firstLed', 'lastLed', 'side'], server: ['result'] },
];

const instDefaults = {
  externalBay: false,
  dualTray: true,
  onePickGripper: false,
  laser: false,
  alphanumericBar: true, // alphanumeric bar
  ledBar: false, // simple ledbar
  ptl: false, // when controlled  by Modula
  carousel: false, // reject DOOR/RGB/xxxx_BIN commands,
  nrTrays: 67,
  models: [{ // 0
    model: 'MC25D',
    trayWidth: 2500, // mm
    trayDepth: 857, // mm
    trayNetPayload: 250, // kg
    displayMaxCol: 912, // 38 cols / 10 cm
  },
  { // 1
    model: 'ML50D',
    trayWidth: 4100, // mm
    trayDepth: 857, // mm
    trayNetPayload: 500, // kg
    displayMaxCol: 1520, // 38 cols / 10 cm total 4000
  },
  ],
};

const vlms = [

  {
    vlm: '1',
    liftGroup: 0,
    modelIndex: 0,
    trayOffset: 1000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
  {
    vlm: '2',
    liftGroup: 0,
    modelIndex: 1,
    trayOffset: 2000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
  {
    vlm: '3',
    liftGroup: 0,
    modelIndex: 1,
    trayOffset: 3000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
  {
    vlm: '4',
    liftGroup: 1,
    modelIndex: 1,
    trayOffset: 4000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
  {
    vlm: '5',
    liftGroup: 1,
    modelIndex: 1,
    trayOffset: 5000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
  {
    vlm: '6',
    liftGroup: 1,
    modelIndex: 0,
    trayOffset: 6000,
    bays: [{
      status: 0, posPick: [0, 0], posExe: [0, 0], posOnePick: [0],
    }],
  },
];

/*
 * Real processing starts here:
 * - client
 * - server
 * - readline/quit processing and stopindicator
 */
// client webservice to file or hostcom http
let exiting = false;
let openRequestCount = 0;
let waitReadyCount = 0;
// common

function getDataLines(data) {
  // run this when data is received
  if (data === undefined || data === null) {
    return data;
  }
  // const dataString = data.toString().replace(/(\r\n|\n)/gm, '\r'); // normalize to \r
  const dataString = data.toString(); // .replace(/(\r\n|\n)/gm, '\r'); // normalize to \r
  const dataLines = dataString.split(terminator);
  if (dataLines.length > 1 && dataLines[dataLines.length - 1] === '') {
    // zap last if empty
    dataLines.pop();
  }
  debugd('getDataLines', dataLines);
  return dataLines;
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
  if (dataArgs.length < 3) { // in case there is no command
    debugd(`getCommand MISSING_ID ${dataArgs.length} ${dataArgs}`);
    const cmd = {
      errorText: 'MISSING_ID',
    };
    return cmd;
  }
  let prefix; let requestId; let command; let parameters;
  let podId; let deviceId;
  [prefix, requestId, command, ...parameters] = dataArgs;
  // const command = dataArgs[2]; // gets the command
  const curCmd = commands.find((i) => i.name === command);
  if (curCmd === undefined) {
    const curPodCmd = podCommands.find((i) => i.name === parameters[0]);
    if (curPodCmd !== undefined) {
      prefix = undefined;
      [podId, deviceId, requestId, command, ...parameters] = dataArgs;
      // handle podCommand
    } else {
      debugd(`getCommand command ${command} unknown return BAD_COMMAND data ${dataArgs.length} ${dataArgs}`);
      const cmd = {
        errorText: 'BAD_COMMAND',
      };
      return cmd;
    }
  }
  if (isRequest) {
    if (curCmd.client.length !== parameters.length) {
      debugd(`getCommand ${command} insufficient parameters return BAD_PARAMETERS ${curCmd.client} parameters ${parameters} data ${dataArgs.length} ${dataArgs}`);
      // debugs(`data ${data}`);
      const cmd = {
        errorText: 'BAD_PARAMETERS',
      };
      return cmd;
    }
    const req = { prefix, requestId, command: curCmd.name.toLowerCase() };
    for (let i = 0; i < curCmd.client.length; i++) { // create object with client parameters
      req[curCmd.client[i]] = parameters[i];
    }
    req.errorText = errorText;
    req.curCmd = curCmd;
    return req;
  }

  if (curCmd.server.length !== parameters.length) {
    debugd(`getCommand response ${command} insufficient parameters ${curCmd.server.length} ${parameters.length} return BAD_PARAMETERS ${curCmd.server} parameters ${parameters} data ${dataArgs.length} ${dataArgs}`);
    const cmd = {
      errorText: 'BAD_PARAMETERS',
    };
    return cmd;
  }
  const resp = { prefix, requestId, command: curCmd.name.toLowerCase() };
  for (let i = 0; i < curCmd.server.length; i++) { // create object with client parameters
    resp[curCmd.server[i]] = parameters[i];
  }
  resp.errorText = errorText;
  resp.curCmd = curCmd;
  return resp;
}

if (isClient) {
  debuglog(`${appName} client http hostcom serverport:${options.serverPort} https:${options.useHttps} hostcomPostBaseUrl:${options.hostcomPostBaseUrl}`);
  const hostname = options.vlmHostName;
  const host = options.vlmIp;
  const port = options.vlmPort;
  const client = new net.Socket();
  // const locus = new net.Socket();
  // const msgCount = 0;
  let requestId = 1;
  const requestQueue = [];
  debugc(`${appName} client.js ${process.env.ORACLE_TNS}: Connect to ${hostname} ${host}:${port}`);

  // queueCommand -> createRequest ack, wait busy, wait complete, status?
  // single open request or single open request per bay?
  // todo: globals to par object?
  function createRequest(prefix, req) {
    const req2 = req;
    let curCmd = commands.find((i) => i.name === req2.command);
    let msg = prefix + separator + requestId + separator + curCmd.name;

    if (curCmd === undefined) {
      const curPodCmd = podCommands.find((i) => i.name === req2.command);
      if (curPodCmd !== undefined) {
        msg = req2.podId + separator + req2.deviceId + separator + requestId + separator + curPodCmd.name;
        curCmd = curPodCmd;
      } else {
        debugc(`queueCommand ${req2.command} unknown`);
        // connection.write('BAD_COMMAND\r');
        return req2;
      }
    } else {
      req2.prefix = prefix;
    }
    for (let i = 0; i < curCmd.client.length; i++) { // create object with client parameters
      msg = msg + separator + req2[curCmd.client[i]];
    }
    req2.msg = msg;
    req2.requestId = requestId.toString();

    requestId += 1;
    return req2;
  }
  function processRequestQueue(checkOpenRequestCount) {
    if (checkOpenRequestCount && openRequestCount > 1) {
      debugdt(`processRequestQueue ${openRequestCount} skip write`);
    }
    if (requestQueue.length > 0) {
      const req2 = requestQueue.find((i) => i.send === null);
      if (req2 !== undefined) {
        const now = Date.now();
        req2.send = now;
        req2.ackTimeout = now + 2000;
        if (['CALL', 'RETURN'].includes(req2.command)) {
          req2.readyTimeout = now + 120 * 1000;
        }
        client.write(req2.msg + terminator);
        debugc(`processRequestQueue ${openRequestCount} ${req2.msg}`);
        debugdt(req2);
      } else if (openRequestCount > 0) {
        debugc(`processRequestQueue ${openRequestCount} reset`);
        openRequestCount = 0;
      }
    }
  }
  function queueCommand(prefix, req) {
    const req2 = createRequest(prefix, req);
    const { msg } = req2;
    debugc(`queueCommand ${prefix} ${msg}`);
    debugdt(req2);
    req2.queued = Date.now();
    req2.send = null;
    req2.ackTimeout = null;
    req2.ack = null;
    req2.readyTimeout = null;
    requestQueue.push(req2);
    openRequestCount++;
    processRequestQueue(true);
  }

  function debugDisplay(prefix, message) {
    displayClear(prefix);
    displayShow(prefix, message, 200, 0);
  }

  // move storage/retrieval finished 'end/ready' or 'timeout'
  function vlmBaySrCommandFinished(prefix, curRequest, curBay, curVlm, timeout) {
    // demo script, show status on display...
    const finished = !timeout;
    debugdt(curRequest);
    //debugDisplay(prefix, `Finished ${curRequest.command} ${curRequest.position} f${finished} t${timeout}`);
    debugDisplay(prefix, `Centric and Vanas at Allsport: VLM ${prefix} ${curRequest.command} ${curRequest.position}`);
  }
  // Vlm/Bay idle and in automayic mode ...
  function vlmBayReadyForSrCommand(prefix, curBay, curVlm) {
    // demo script
    const waitIdleTimeout = 5000;
    debugvm(`Wait ${waitIdleTimeout} 1:${curBay.posPick[0]}:E${curBay.posExe[0]}/2:${curBay.posPick[1]}:E${curBay.posExe[1]}`);
    debugDisplay(prefix, `Wait ${waitIdleTimeout} 1:${curBay.posPick[0]}:E${curBay.posExe[0]}/2:${curBay.posPick[1]}:E${curBay.posExe[1]}`);
    setTimeout(() => { // determine next command: RETURN 1, RETURN 2 or CALL 1 or CALL 2
      debugvm(`Timeout ${waitIdleTimeout} 1:${curBay.posPick[0]}:E${curBay.posExe[0]}/2:${curBay.posPick[1]}:E${curBay.posExe[1]}`);
      debugDisplay(prefix, `Timeout ${waitIdleTimeout} 1:${curBay.posPick[0]}:E${curBay.posExe[0]}/2:${curBay.posPick[1]}:E${curBay.posExe[1]}`);
      if ((curBay.posPick[0] > 0) && (curBay.posExe[1] !== 0)) {
        debugvm(`return 1 ${prefix} cur ${curBay.posPick[0]} ${curBay.posExe[1]}`);
        returnPosition(prefix, 1);
      } else if (curBay.posPick[1] > 0 && (curBay.posExe[0] !== 0)) {
        debugvm(`return 2 ${prefix} cur ${curBay.posPick[1]} ${curBay.posExe[0]}`);
        returnPosition(prefix, 2);
      }
      else if ((curBay.posExe[0] === 0) && (curBay.posPick[0] === 0)) {
        let tray = 1;
        const maxTray = 67;
        tray += trayCount;
        trayCount++;
        if (tray > maxTray) {
          tray = 1;
          trayCount = 1;
        }
        debugvm(`call 1 ${prefix} ${tray} cur ${curBay.posExe[0]} ${curVlm.trayOffset}`);
        callTray(prefix, tray + curVlm.trayOffset, 1);
      } else if ((curBay.posExe[1] === 0) && (curBay.posPick[1] === 0)) {
        let tray = 67;
        const maxTray = 67;
        tray -= trayCount;
        trayCount++;
        if (tray <= 1) {
          tray = maxTray;
          trayCount = 1;
        }
        debugvm(`call 2 ${prefix} ${tray} cur ${curBay.posExe[0]} ${curVlm.trayOffset}`);
        callTray(prefix, tray + curVlm.trayOffset , 2);
      }
      /*
      else
      else if (curBay.posPick[1] > 0) {
        debugvm(`return B 2 ${prefix} cur ${curBay.posPick[1]} ${curBay.posExe[1]}`, curBay);
        returnPosition(prefix, 2);
      } else if (curBay.posPick[0] > 0) {
        debugvm(`return B 1 ${prefix} cur ${curBay.posPick[0]} ${curBay.posExe[1]}`, curBay);
        returnPosition(prefix, 1);
      } */
      }, waitIdleTimeout);
  }

  function processStatusResponse(resp) {
    let statusTimeout = 30 * 1000;
    // debugc('processStatusResponse', resp);
    const { prefix } = resp;
    const vlmIndex = prefix.substring(0, prefix.length - 1);
    const bay = prefix.substring(prefix.length - 1);
    // debugv(`getVlmBay1 ${prefix} ${vlmIndex} ${bay}`);
    const curVlm = vlms.find((i) => i.vlm === vlmIndex);
    const bayIndex = bay - 1;
    if (resp.pos1PickTray >= curVlm.trayOffset) {
      resp.pos1PickTray -= curVlm.trayOffset;
    }
    if (resp.pos2PickTray >= curVlm.trayOffset) {
      resp.pos2PickTray -= curVlm.trayOffset;
    }
    if (resp.pos1ExeTray >= curVlm.trayOffset) {
      resp.pos1ExeTray -= curVlm.trayOffset;
    }
    if (resp.pos2ExeTray >= curVlm.trayOffset) {
      resp.pos2ExeTray -= curVlm.trayOffset;
    }
    curVlm.bays[bayIndex].status = +resp.status;
    curVlm.bays[bayIndex].posPick[0] = +resp.pos1PickTray;
    curVlm.bays[bayIndex].posPick[1] = +resp.pos2PickTray;
    curVlm.bays[bayIndex].posExe[0] = +resp.pos1ExeTray;
    curVlm.bays[bayIndex].posExe[1] = +resp.pos2ExeTray;
    //curVlm.bays[bayIndex].posOnePick[0] = +resp.pos1OnePickTray;

    // extra in client
    curVlm.bays[bayIndex].errorCode = +resp.errorCode;
    // check ready commands?
    const curBay = curVlm.bays[bayIndex];
    const index = requestQueue.findIndex((i) => i.prefix === resp.prefix && i.readyTimeout !== null);
    const curRequest = requestQueue.find((i) => i.prefix === resp.prefix && i.readyTimeout !== null);
    if (index > -1) {
      //debugc(`processStatusResponse ${waitReadyCount} check ready`, curRequest);
      const now = Date.now();
      let finished = false;
      let timeout = false;
      const posIndex = curRequest.position - 1;
      const otherPosIndex = 1 - posIndex;
      if (curRequest.command === 'CALL') {
        // finished and current pick position
        if (curBay.posPick[posIndex] === curRequest.tray - curVlm.trayOffset) {
          finished = true;
        } else if (curBay.posExe[posIndex] === curRequest.tray - curVlm.trayOffset
            && (curBay.posPick[otherPosIndex] !== 0)) {
          // assume finished but other pos is actual picking
          finished = true;
        } else if (curRequest.readyTimout < now) {
          timeout = true;
        }
      } else if (curRequest.command === 'RETURN') {
        if (curBay.posPick[posIndex] === 0
           && curBay.posExe[posIndex] === 0) {
          finished = true;
        } else if (curRequest.readyTimout < now) {
          timeout = true;
        }
      } else {
        finished = true;
      }
      if (!finished && !timeout) {
        statusTimeout = 10000;
      } else {
        requestQueue.splice(index, 1); // remove request as it is resolved and no waiting for ready
        if (waitReadyCount > 0) {
          waitReadyCount -= 1;
        }
        debugvm(`Command ready ${curRequest.prefix}|${curRequest.requestId}|${curRequest.command} remove ${index} f${finished} t${timeout} from requestQueue`);
        vlmBaySrCommandFinished(prefix, curRequest, curBay, curVlm, timeout);
        //vlmBayReadyForSrCommand(prefix, curBay, curVlm);
      } // no current command.
    } else if (curBay.status === 0) {
      vlmBayReadyForSrCommand(prefix, curBay, curVlm);
    }
    setTimeout(() => { // slow or fast status poll
      debugc(`processStatusResponse ${waitReadyCount} ${statusTimeout}  ${resp.prefix}`);
      getStatus(resp.prefix);
    }, statusTimeout);
    //debugc('processStatusResponse2', curVlm);
  }

  // startup ask status of each bay in installation
  function initStatus() {
    for (const vlm of vlms) {
      let bayNr = 1;
      for (const bay of vlm.bays) {
        bay.status = -1; // 0..4 after status command...
        const prefix = vlm.vlm + bayNr.toString();
        getStatus(prefix);
        bayNr += 1;
      }
    }
  }

  function processResponse(resp) {
    if (requestQueue.length > 0) {
      const index = requestQueue.findIndex((i) => i.requestId === resp.requestId);
      const curRequest = requestQueue.find((i) => i.requestId === resp.requestId);
      const now = Date.now();
      if (index > -1) {
        const respTime = now - curRequest.send || now;
        debugc(`processResponse ack ${index} ${resp.requestId} ${respTime} for request`);
        debugdt(curRequest);
      } else {
        debugc(`processResponse ack ${index} ${resp.requestId} ??? for request`);
        debugdt(curRequest);
      }
      if (index > -1) {
        if (curRequest.readyTimeout === null) {
          // remove request as it is resolved and no waiting for ready
          requestQueue.splice(index, 1);
          debugc(`remove ${index} from requestQueue`);
        } else { // ready timeout: fast status, otherwise slow status... for now per bay?
          curRequest.ack = now;
          waitReadyCount += 1;
          debugc(`WaitReady ${waitReadyCount} for ${curRequest.prefix}`);
          setTimeout(() => {
            debugc(`Delayed WaitReady ${waitReadyCount} for ${curRequest.prefix}`);
            getStatus(curRequest.prefix);
          }, 10 * 1000);
        }
      }
      if (openRequestCount > 0) {
        openRequestCount -= 1;
      }
      if (resp.command === 'status') {
        processStatusResponse(resp);
      }
      processRequestQueue(false);
    }
  }
  // get status for bay within VLM
  function getStatus(prefix) {
    const req = {
      command: 'STATUS',
    };
    queueCommand(prefix, req);
  }

  // retrieveTray
  function callTray(prefix, tray, position) {
    const req = {
      command: 'CALL',
      tray,
      position,
    };
    queueCommand(prefix, req);
  }

  // storeTray
  function returnPosition(prefix, position) {
    const req = {
      command: 'RETURN',
      position,
    };
    queueCommand(prefix, req);
  }

  function displayShow(prefix, message, col, arrow) {
    const req = {
      command: 'DISPLAY_SHOW',
      message,
      col,
      arrow,
    };
    queueCommand(prefix, req);
  }

  function displayClear(prefix) {
    const req = {
      command: 'DISPLAY_CLEAR',
    };
    queueCommand(prefix, req);
  }

  client.connect(port, host, () => {
    debugc(`client connected to ${host}:${port}`);
    // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
    if (options.sendOnce !== null && options.SendOnce !== undefined) {
      debugc(`sendOnce ${options.sendOnce}`);
      client.write(options.sendOnce);
    }
    /*
    getStatus('101');
    displayClear('101');
    displayShow('101', 'Hoi', 10, 1);
    callTray('101', 13, 1);
    getStatus('101');
    getStatus('111');
    getStatus('101');
*/
    initStatus();
  });
  client.on('data', (data) => {
    const dataLines = getDataLines(data);
    if (dataLines === undefined || dataLines === null) {
      return;
    }
    for (const dataLine of dataLines) {
      const resp = getCommand(dataLine.split(separator), false);
      debugdt('Response', resp);
      processResponse(resp);
    }
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

  const bayOptions = [];
  function getVlmBay(prefix) {
    let errorText = 'OK';
    // debugv(`getVlmBay2 ${prefix} ${prefix.length}`);
    const vlmIndex = prefix.substring(0, prefix.length - 1);
    const bay = prefix.substring(prefix.length - 1);
    // debugv(`getVlmBay1 ${prefix} ${vlmIndex} ${bay}`);
    const curVlm = vlms.find((i) => i.vlm === vlmIndex);
    // debugv(`getVlmBay ${prefix} ${vlmIndex} ${bay} ${curVlm}`);
    if (curVlm === undefined) {
      errorText = 'BAD_PREFIX';
    }
    if (curVlm.bays.length < bay) {
      errorText = 'BAD_PREFIX';
    }
    const bayIndex = bay - 1;
    if (bayOptions[prefix] === undefined) {
      // init options.
      bayOptions[prefix] = {
        prefix,
        externalBay: curVlm.bays[bayIndex].externalbay || instDefaults.externalBay,
        dualTray: curVlm.bays[bayIndex].dualTray || instDefaults.dualTray,
        onePickGripper: curVlm.bays[bayIndex].onePickGripper || instDefaults.onePickGripper,
        laser: curVlm.bays[bayIndex].laser || instDefaults.laser,
        alphanumericBar: curVlm.bays[bayIndex].alphanumericBar || instDefaults.alphanumericBar,
        ledBar: curVlm.bays[bayIndex].ledBar || instDefaults.ledBar,
      };
      if (bayOptions[prefix].laser) {
        bayOptions[prefix].laserStatus = {
          status: 0, position: 0, x: 0, y: 0,
        };
      }
      if (bayOptions[prefix].alphanumericBar) {
        bayOptions[prefix].alphanumericBarStatus = { message: '', col: 0, arrow: 0 };
      }
      if (bayOptions[prefix].ledBar) {
        bayOptions[prefix].ledBarStatus = { ledX: 0, ledY: 0, ledOrder: 0 };
      }
      // debugv(`getVlmBay set bayOptions`, bayOptions[prefix]);
    }
    const resp = {
      errorText, vlm: curVlm, bayIndex, bay: bayOptions[prefix],
    };
    debugv(`getVlmBay ${prefix} OK result`);
    debugdt('getVlmBay OK result', resp);
    // console.dir(JSON.parse(bayOptions[prefix].toString()), {depth:null});
    return resp;
  }

  function handleStatus(req) {
    const vlmBay = getVlmBay(req.prefix);
    if (vlmBay.errorText !== 'OK') {
      const resp = {
        errorText: vlmBay.errorText,
      };
      return resp;
    }
    const curBay = vlmBay.vlm.bays[vlmBay.bayIndex];
    const errorCode = curBay.status;

    const resp = {
      errorText: vlmBay.errorText,
      prefix: req.prefix,
      requestId: req.requestId,
      command: req.command.toUpperCase(),
      status: curBay.status,
      pos1PickTray: curBay.posPick[0],
      pos2PickTray: curBay.posPick[1],
      pos1ExeTray: curBay.posExe[0],
      pos2ExeTray: curBay.posExe[1],
      errorCode,
      //pos1OnePickTray: curBay.posOnePick[0],
    };
    return resp;
  }

  function delayJitter(x) {
    const y = x + Math.floor(Math.random() * (x / 10.0));
    debugs(`delayJitter ${x} ${y}`);
    return y;
  }
  function addVlmOperation(vlmBay, operation, tray, posIndex, positionTo) {
    const delay = delayJitter(3000 + tray * 1000);
    if (operation === 'dropoff') {
      const otherPosIndex = 1 - posIndex;

      vlmBay.vlm.bays[vlmBay.bayIndex].posPick[otherPosIndex] = 0; // invalidate pick other position?.. no store does...
      vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = 0;
      vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = tray;
      setTimeout(() => {
        debugvm(`addVlmOperation finished ${operation} tray ${tray} positionTo ${positionTo} after ${delay}`);
        debugdt(vlmBay);
        vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = tray;
        vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = tray;
      }, delay);
    } else if (operation === 'store') {
      vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = 0;
      vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = tray;
      setTimeout(() => {
        debugvm(`addVlmOperation finished ${operation} tray ${tray} positionTo ${positionTo} after ${delay}`);
        debugdt(vlmBay);
        vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = 0;
        vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = 0;
      }, delay);
    } else if (operation === 'retrieve') {
      vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = 0;
      vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = tray;
      setTimeout(() => {
        debugvm(`addVlmOperation finished ${operation} tray ${tray} positionTo ${positionTo} after ${delay}`);
        debugdt(vlmBay);
        vlmBay.vlm.bays[vlmBay.bayIndex].posPick[posIndex] = tray;
        vlmBay.vlm.bays[vlmBay.bayIndex].posExe[posIndex] = tray;
      }, delay);
    }

    debugv(`addVlmOperation ${operation} tray ${tray} positionTo ${positionTo} wait ${delay}`);
    debugdt(vlmBay);
  }

  function handleCall(req) {
    let result = 0;
    let resultText = 'OK';
    const vlmBay = getVlmBay(req.prefix);
    if (vlmBay.errorText !== 'OK') {
      const resp = {
        errorText: vlmBay.errorText,
      };
      return resp;
    }
    const nrTrays = vlmBay.vlm.nrTrays || instDefaults.nrTrays;
    // check tray and position valid
    if ((result === 0)
      && (req.tray <= 0 || req.tray > nrTrays)) {
      result = -1; // tray number not valid
      resultText = 'tray number not valid';
    }
    if ((result === 0)
      && (req.position < 1 || req.position > 2 || (req.position === 2 && !vlmBay.bay.dualTray))) {
      result = -2; // position not valid
      resultText = 'position not valid';
    }
    // check tray and position not busy
    const curBay = vlmBay.vlm.bays[vlmBay.bayIndex];
    const posIndex = req.position - 1;
    if ((result === 0)
     && (curBay.posPick[posIndex] !== 0
     || curBay.posExe[posIndex] !== 0)) {
      result = -3; // position is busy
      resultText = 'position is busy';
    }

    if (result === 0) {
      for (const bay of vlmBay.vlm.bays) {
        if (bay.posPick[0] === req.tray
          || bay.posPick[1] === req.tray
          || bay.posExe[0] === req.tray
          || bay.posExe[1] === req.tray) {
          result = -4; // tray is busy
          break;
        }
      }
    }
    if (result === 0) {
      let positionTo = req.position;
      const otherPosIndex = 1 - posIndex;

      if (curBay.posPick[otherPosIndex] !== 0) {
        positionTo = 0; // keep on lift
      }
      addVlmOperation(vlmBay, 'retrieve', req.tray, posIndex, positionTo);
    }
    debugv(`handleCall ${req.prefix} ${req.command} ${req.tray} ${req.position} result ${result} ${resultText}`);
    const resp = {
      errorText: vlmBay.errorText,
      prefix: req.prefix,
      requestId: req.requestId,
      command: req.command.toUpperCase(),
      result,
    };

    return resp;
  }

  function handleReturn(req) {
    let result = 0;
    let resultText = 'OK';
    const vlmBay = getVlmBay(req.prefix);
    if (vlmBay.errorText !== 'OK') {
      const resp = {
        errorText: vlmBay.errorText,
      };
      return resp;
    }
    /*
    const nrTrays = resp.vlm.nrTrays || instDefaults.nrTrays;
    // check tray and position valid
    if ((result === 0)
      && (req.tray <= 0 || req.tray > nrTrays)) {
        result = -1; // tray number not valid
    }
    */
    if ((result === 0)
      && (req.position < 1 || req.position > 2 || (req.position === 2 && !vlmBay.bay.dualTray))) {
      result = -2; // position not valid
      resultText = 'position not valid';
    }
    // check tray and position not busy
    const posIndex = req.position - 1;
    const curBay = vlmBay.vlm.bays[vlmBay.bayIndex];
    if ((result === 0)
     && (curBay.posPick[posIndex] === 0)) {
      result = -1; // empty position
      resultText = 'empty position';
    }
    // bay, posTo 0 lift, 1, 2, tray, retrieve 2, = call, store 1, = return
    const otherPosIndex = 1 - posIndex;
    if ((result === 0)
     && (curBay.posExe[otherPosIndex] !== 0)) {
      addVlmOperation(vlmBay, 'dropoff', curBay.posExe[otherPosIndex], otherPosIndex, otherPosIndex + 1);
    }
    if (result === 0) {
      addVlmOperation(vlmBay, 'store', curBay.posPick[posIndex], posIndex, req.position);
    }
    debugv(`handleReturn ${req.prefix} ${req.command} ${req.tray} ${req.position} result ${result} ${resultText}`);
    const resp = {
      errorText: vlmBay.errorText,
      prefix: req.prefix,
      requestId: req.requestId,
      command: req.command.toUpperCase(),
      result,
    };
    return resp;
  }

  function handleDisplay(req) {
    let result = -1;
    const vlmBay = getVlmBay(req.prefix);
    if (vlmBay.errorText !== 'OK') {
      const resp = {
        errorText: vlmBay.errorText,
      };
      return resp;
    }
    if (vlmBay.bay.alphanumericBar) {
      if (req.command === 'display_show') {
        vlmBay.bay.alphanumericBarStatus = { message: req.message, col: req.col, arrow: req.arrow };
      } else {
        vlmBay.bay.alphanumericBarStatus = { message: '', col: 0, arrow: 0 };
      }
      result = 0;
    }
    debugv(`handleDisplay ${req.prefix} ${req.command}`, vlmBay.bay.alphanumericBarStatus);
    const resp = {
      errorText: vlmBay.errorText,
      prefix: req.prefix,
      requestId: req.requestId,
      command: req.command.toUpperCase(),
      result,
    };
    return resp;
  }

  function handleDisplayClear(req) {
    return handleDisplay(req);
  }

  function handleDisplayShow(req) {
    return handleDisplay(req);
  }

  const handleCommands = [
    { name: 'PROTOCOL', fn: handleProtocol },
    { name: 'STATUS', fn: handleStatus },
    { name: 'CALL', fn: handleCall },
    { name: 'RETURN', fn: handleReturn },
    { name: 'DISPLAY_CLEAR', fn: handleDisplayClear },
    { name: 'DISPLAY_SHOW', fn: handleDisplayShow },
  ];

  const port = options.vlmPort;
  debuglog(`${appName} server ${options.vlmPort}`);
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
      for (const dataLine of dataLines) {
        const req = getCommand(dataLine.split(separator), true);

        debugdt('Request ', req);
        // console.log('req ', req);
        if (req.errorText !== 'OK') {
          connection.write(req.errorText + terminator);
          return;
        }
        // lookup handler function
        const fn = handleCommands.find((i) => i.name === req.curCmd.name);
        if (fn === undefined) {
          debugs(`NO_HANDLER_IMPLEMENTED:${req.command}`);
          connection.write(`NO_HANDLER_IMPLEMENTED:${req.command}\r`);
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
          connection.write(response);
        } else {
          debugs(`Response error ${resp.errorText}`);
          debugdt(resp);
          connection.write(resp.errorText + terminator);
        }
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
