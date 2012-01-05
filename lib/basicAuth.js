/**
 * Basic Auth
 * More in line with connect.
 */

module.exports = function(username, password) {
  var func;

  /*if (typeof username === 'function') {
    func = username;
  }*/

  if (typeof username === 'string') {
    func = function(user, pass) {
      return user === username && pass === password;
    };
  }

  return function(req, res, next) {
    if (req.username) return next();

    function verify(ok) {
      if (ok) {
        req.username = user;
        return next();
      }

      res.statusCode = 401;
      res.setHeader(
        'WWW-Authenticate',
        'Basic realm="secure area"'
      );
      res.end();
    }

    var auth = req.headers.authorization;
    if (auth) {
      var s = auth.split(' ')
        , scheme = s[0]
        , pair = new Buffer(s[1], 'base64').toString('utf8').split(':')
        , user = pair[0]
        , pass = pair[1];

      if (scheme !== 'Basic') {
        return res.statusCode = 400, res.end();
      }

      /*if (!func) {
        return verify(user === username && pass === password);
      } else if (func.length === 2) {
        return verify(func(user, pass));
      } else if (func.length === 3) {
        return func(user, pass, verify);
      }*/

      if (func.length === 3) {
        return func(user, pass, function(err, user_) {
          if (!err && user_) return user = user_, verify(true);
          verify(false);
        });
      } else {
        return verify(func(user, pass));
      }
    }

    return verify(false);
  };
};


