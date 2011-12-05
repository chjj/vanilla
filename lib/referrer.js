/**
 * Referrer Log
 */

var fs = require('fs');

module.exports = function(opt) {
  opt = opt || {};

  if (typeof opt === 'string') {
    opt = { path: opt };
  }

  var written = 0
    , len = 0
    , path = opt.path || '/tmp/referrers.log'
    , limit = opt.limit || 10 * 1024 * 1024
    , data = { total: 0 }
    , busy = false;

  var flush = function() {
    var data_ = data;

    if (len < 5120
        || busy) return;

    data = { total: 0 };
    len = 0;
    busy = true;

    fs.readFile(path, 'utf8', function(err, out) {
      if (err && err.code !== 'ENOENT') {
        console.error(err + '');
        busy = false;
        flush();
        return;
      }

      out = JSON.parse(out);

      for (var key in data_) {
        if (!out[key]) out[key] = 0;
        out[key] += data_[key];
      }

      out = JSON.stringify(out);

      fs.writeFile(path, out, function() {
        busy = false;
        flush();
      });
    });
  };

  var push = function(ref) {
    if (written > limit) return;
    data.total++;
    if (!ref) return;
    if (!data[ref]) {
      data[ref] = 0;
      len += ref.length;
      written += ref.length;
    }
    data[ref]++;
    flush();
  };

  return function(req, res, next) {
    if (req.pathname === '/favicon.ico'
        || req._logged) return next();
    req._logged = true;

    var start = Date.now()
      , head = req.headers
      , writeHead = res.writeHead;

    res.writeHead = function(code) {
      res.writeHead = writeHead;
      push(head.referrer || head.referer);
      return writeHead.apply(res, arguments);
    };
    next();
  };
};
