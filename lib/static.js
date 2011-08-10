/**
 * Static
 */

var fs = require('fs')
  , join = require('path').join;

module.exports = function(opt) {
  var path = opt.path || opt
    , list = fs.readdirSync(path);

  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();

    if (~req.url.indexOf('..')) return res.error(403);

    // this removes the need for stat calls
    if (!~list.indexOf(req.path[0])) return next();

    res.sendfile(join(path, req.pathname), next);
  };
};
