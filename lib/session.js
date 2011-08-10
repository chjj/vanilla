/**
 * Sessions
 */

module.exports = function(opt) {
  var crypto = require('crypto');

  if (!opt || !opt.secret) {
    throw new
      Error('`secret` must be provided for sessions.');
  }

  var secret = opt.secret
    , life = opt.life || 2 * 7 * 24 * 60 * 60 * 1000;

  var hash = function(data) {
    return crypto.createHmac('sha256', secret)
                 .update(data).digest('base64');
  };

  // maybe swap ciphers and 
  // hmacs for better security
  var stringify = function(data, flag) {
    if (!data) data = {};

    try {
      var time = Date.now().toString(36)
        , flag = flag || time
        , data = JSON.stringify(data)
        , ci;

      // hack to get around the base64 bug
      ci = crypto.createCipher('bf-cbc', secret);
      data = new Buffer(
        ci.update(data, 'utf8', 'binary')
        + ci.final('binary'), 'binary'
      ).toString('base64');

      // would normally need to qs.escape, 
      // but res.cookie takes care of this
      data = [hash(data + flag), data, time].join(':');

      // http://tools.ietf.org/html/rfc6265#page-27
      if (Buffer.byteLength(data) <= 4096) {
        return data;
      }
    } finally {
      return stringify({}, flag);
    }
  };

  var parse = function(cookie, flag) {
    if (!cookie) return {};
    try {
      var cookie = cookie.split(':')
        , hmac = cookie[0]
        , data = cookie[1]
        , time = cookie[2]
        , flag = flag || time
        , dec;

      time = parseInt(time, 36);

      if (hmac === hash(data + flag) 
          && time > (Date.now() - life)) {
        dec = crypto.createDecipher('bf-cbc', secret);
        data = dec.update(data, 'base64', 'utf8') 
               + dec.final('utf8');
        return JSON.parse(data);
      }
    } finally {
      return {};
    }
  };

  return function(req, res, next) {
    if (req.pathname === '/favicon.ico' 
        || req.session) return next();

    var ip = req.socket.remoteAddress
      , writeHead = res.writeHead;

    req.session = parse(req.cookies.session, ip);
    res.writeHead = function() {
      res.writeHead = writeHead;
      if (req.session) {
        var data = stringify(req.session, ip);
        res.cookie('session', data, {
          maxAge: life, httpOnly: true
        });
      } else {
        res.clearCookie('session');
      }
      return writeHead.apply(res, arguments);
    };
    next();
  };
};

