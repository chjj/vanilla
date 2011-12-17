/**
 * Static
 */

var fs = require('fs')
  , join = require('path').join;

module.exports = function(opt) {
  var path = opt.path || opt;
  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();

    if (~req.url.indexOf('..')) return res.error(403);

    res.sendfile(join(path, req.pathname), function(err) {
      if (err && err.code === 'ENOENT') return next();
      next(err);
    });
  };
};

module.exports.mime = module.parent.exports.mime;
