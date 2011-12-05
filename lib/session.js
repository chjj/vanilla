/**
 * Sessions
 */

var crypto = require('crypto');

module.exports = function(opt) {
  if (!opt || !opt.secret) {
    throw new
      Error('`secret` must be provided for sessions.');
  }

  var secret = opt.secret
    , life = opt.life || 2 * 7 * 24 * 60 * 60 * 1000;

  var hash = function(data) {
    return crypto
      .createHmac('sha256', secret)
      .update(data).digest('base64');
  };

  var encrypt = (function() {
    if (/^v[1-9]|^v0\.[5-9]\.\d+$|^v0\.4\.[1-9][1-9]$/.test(process.version)) {
      return function(data) {
        var cipher = crypto.createCipher('bf-cbc', secret);
        return cipher.update(data, 'utf8', 'base64')
             + cipher.final('base64');
      };
    } else {
      // hack to get around the base64 bug
      return function(data) {
        var cipher = crypto.createCipher('bf-cbc', secret);
        data = cipher.update(data, 'utf8', 'binary')
             + cipher.final('binary');
        return new Buffer(data, 'binary').toString('base64');
      };
    }
  })();

  var decrypt = function(data) {
    var decipher = crypto.createDecipher('bf-cbc', secret);
    return decipher.update(data, 'base64', 'utf8')
         + decipher.final('utf8');
  };

  // maybe swap ciphers and
  // hmacs for better security
  var stringify = function(data, flag) {
    if (!data) data = {};

    try {
      var time = Date.now().toString(36)
        , flag = flag || time
        , data = JSON.stringify(data);

      data = encrypt(data);

      // would normally need to qs.escape,
      // but res.cookie takes care of this
      data = [hash(data + flag), data, time].join(':');

      // http://tools.ietf.org/html/rfc6265#page-27
      if (Buffer.byteLength(data) <= 4096) {
        return data;
      }
    } catch(e) {
      ;
    }

    return stringify({}, flag);
  };

  var parse = function(cookie, flag) {
    if (!cookie) return {};

    try {
      var cookie = cookie.split(':')
        , hmac = cookie[0]
        , data = cookie[1]
        , time = cookie[2]
        , flag = flag || time;

      time = parseInt(time, 36);

      if (hmac === hash(data + flag)
          && time > (Date.now() - life)) {
        data = decrypt(data);
        return JSON.parse(data);
      }
    } catch(e) {
      ;
    }

    return {};
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
          maxAge: life,
          httpOnly: true
        });
      } else {
        res.clearCookie('session');
      }
      return writeHead.apply(res, arguments);
    };
    next();
  };
};
