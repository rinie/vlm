// ptl.js definition file for localhost testing so ptl-localhost.js
const basePath = '/opt/locus';
const appName = 'ptl';

module.exports = {
  ptlHostName: process.env.PTL_IP || '127.0.0.1',
  ptlIp: process.env.PTL_IP || '127.0.0.1',
	ptlPort: 11000,	// PTL server listens on this port
  ptlMessageType: 0x60, // PTL port default
  //sendOnce: `0|1|PROTOCOL|2.0\r`,
  sendOnce: 0x13,
  clientStopIndicator: basePath + `/var/run/doe-${appName}-in_stopind`,
  serverStopIndicator: basePath + `/var/run/doe-${appName}-out_stopind`,
  removeStopIndicatorOnStart: true,
  reloadInterval: 60*60*1000, // reload/exit every hour
  //seqIndicator: basePath + '/var/trans/fromhost/hcwsfileseq.bat', //SET HCWSFILESEQ=0000001
	basePath: basePath,
	logPath: basePath + 'var/log/'
};
