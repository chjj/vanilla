/**
 * favicon.ico
 */

var fs = require('fs');

module.exports = function(opt) {
  var icon = fs.readFileSync(opt.path || opt);
  var head = {
    'Content-Type': 'image/x-icon',
    'Content-Length': icon.length,
    'Cache-Control': 'public, max-age=86400'
  };
  return function(req, res, next) {
    if (req.pathname === '/favicon.ico') {
      if (req.httpVersionMinor < 1) {
        res.setHeader('Expires',
          new Date(Date.now() + 86400000).toUTCString());
      }
      res.writeHead(200, head);
      return res.end(icon);
    }
    next();
  };
};
