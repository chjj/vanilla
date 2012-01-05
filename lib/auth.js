/**
 * Basic Auth
 */

module.exports = function(opt) {
  var crypto = require('crypto')
    , users = opt.users
    , secret = opt.secret
    , realm = opt.realm || 'secure area';

  var hash = function(pass) {
    return crypto
      .createHmac('sha256', secret)
      .update(pass).digest('base64');
  };

  return function(req, res, next) {
    if (req.username) return next();

    var auth = req.headers.authorization;
    if (auth) {
      var s = auth.split(' ')
        , scheme = s[0]
        , pair = new Buffer(s[1], 'base64').toString('utf8').split(':')
        , user = pair[0]
        , pass = pair[1];

      if (scheme === 'Basic' && users[user] === hash(pass)) {
        req.username = user;
        return next();
      }
    }

    res.statusCode = 401;
    res.setHeader(
      'WWW-Authenticate',
      'Basic realm="' + realm + '"'
    );
    res.end();
  };
};

module.exports = function(username, password) {
  var func;

  if (typeof username === 'function') {
    func = username;
  }

  return function(req, res, next) {
    if (req.username) return next();

    var auth = req.headers.authorization;
    if (auth) {
      var s = auth.split(' ')
        , scheme = s[0]
        , pair = new Buffer(s[1], 'base64').toString('utf8').split(':')
        , user = pair[0]
        , pass = pair[1];

      if (scheme !== 'Basic') {
        return verify(false);
      }

      if (!func) {
        return verify(user === username && pass === password);
      } else if (func.length === 2) {
        return verify(func(user, pass));
      } else if (func.length === 3) {
        return func(user, pass, verify);
      }
    }

    return verify(false);

    function verify(ok) {
      if (ok) {
        req.username = user;
        return next();
      }

      res.statusCode = 401;
      res.setHeader(
        'WWW-Authenticate',
        'Basic realm="' + realm + '"'
      );
      res.end();
    }
  };
};

