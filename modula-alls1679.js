// modula alls1679 config
module.exports = {
    hostName: process.env.MODULALINK || 'INPAK04', // set in scaleenv.bat
    hostIp: process.env.VLM_IP || '192.168.16.94',
    port: 11000,
    vlm:[ // machine/lift, or inside out Bay->Lift config?... yep
    {
      name: '10',
      type: 'MC25D',
      trays: 67,
      bay [ // or opening
        prefix: '101',
        liftGroup: 1,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
    {
      name: '11',
      type: 'ML25D',
      trays: 67,
      bay [
        prefix: '111',
        liftGroup: 1,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
    {
      name: '12',
      type: 'ML25D',
      trays: 67,
      bay [
        prefix: '121',
        liftGroup: 1,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
    {
      name: '13',
      type: 'ML25D',
      trays: 67,
      bay [
        prefix: '131',
        liftGroup: 2,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
    {
      name: '14',
      type: 'ML25D',
      trays: 67,
      bay [
        prefix: '141',
        liftGroup: 2,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
    {
      name: '15',
      type: 'MC25D',
      trays: 67,
      bay [
        prefix: '151',
        liftGroup: 2,
        positions: 2,
        pos1: 0,
        pos2: 0]
      },
}

