// vlm.js definition file for localhost testing so localhost.js
const basePath = '/opt/locus';
const appName = 'vlm';

module.exports = {
  vlmHostName: process.env.VLM_IP || '127.0.0.1',
  vlmIp: process.env.VLM_IP || '127.0.0.1',
	vlmPort: 11000,	// vlm server listens on this port
  //sendOnce: `0|1|PROTOCOL|2.0\r`,
  //sendOnce: `101|2|STATUS\r`,
  clientStopIndicator: basePath + `/var/run/doe-${appName}-in_stopind`,
  serverStopIndicator: basePath + `/var/run/doe-${appName}-out_stopind`,
  removeStopIndicatorOnStart: true,
  reloadInterval: 60*60*1000, // reload/exit every hour
  //seqIndicator: basePath + '/var/trans/fromhost/hcwsfileseq.bat', //SET HCWSFILESEQ=0000001
	basePath: basePath,
	logPath: basePath + 'var/log/'
};
