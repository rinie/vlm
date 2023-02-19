// conv.js definition file for localhost testing so conv-localhost.js
const basePath = '/opt/locus';
const appName = 'conv';

module.exports = {
  convHostName: process.env.CONV_IP || '127.0.0.1',
  convIp: process.env.CONV_IP || '127.0.0.1',
	convPort: 2021,	// conveyor server listens on this port
  sendOnce: `TT=1,BC=1234567,DEST=0110000100`,
  //sendOnce: `101|2|STATUS\r`,
  clientStopIndicator: basePath + `/var/run/doe-${appName}-in_stopind`,
  serverStopIndicator: basePath + `/var/run/doe-${appName}-out_stopind`,
  removeStopIndicatorOnStart: true,
  reloadInterval: 60*60*1000, // reload/exit every hour
  //seqIndicator: basePath + '/var/trans/fromhost/hcwsfileseq.bat', //SET HCWSFILESEQ=0000001
	basePath: basePath,
	logPath: basePath + 'var/log/'
};
