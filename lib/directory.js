/**
 * Directory Browsing
 */

var path = require('path')
  , fs = require('fs');

module.exports = function(dir) {
  return function(req, res, next) {
    if (req.method !== 'GET') return next();
    if (~req.pathname.indexOf('\0')) return res.error(404);
    if (~req.pathname.indexOf('..')) return res.error(403);

    var file = path.join(dir, req.pathname);

    fs.stat(file, function(err, stat) {
      if (err) {
        if (err.code === 'ENOENT') return next();
        return next(err);
      }

      if (!stat.isDirectory()) return next();

      fs.readdir(file, function(err, list) {
        if (err) return next(err);

        var current = escape(req.pathname)
          , up = escape(path.resolve(req.pathname, '..'));

        var out = [
          '<!doctype html>',
          '<title>' + current + '</title>',
          '<h1>' + current + '</h1>',
          '<ul>',
          '<li>',
          '<a href="' + up + '">',
          '../',
          '</a>',
          '</li>',
        ];

        var i = list.length
          , files = []
          , dirs = [];

        if (!i) return end();

        list.forEach(function(file) {
          var check = path.join(dir, req.pathname, file);
          fs.stat(check, function(err, stat) {
            if (err) return --i || end();

            var obj = stat.isDirectory()
              ? dirs
              : files;

            obj.push(file);

            --i || end();
          });
        });

        function end() {
          files = sort(dirs).concat(sort(files));

          files = files.map(function(file) {
            return [
              '<li>',
              '<a href="'
              + escape(path.join(req.pathname, file))
              + '">'
              + escape(file)
              + (i < dirs.length ? '/' : ''),
              '</a>',
              '</li>'
            ].join('\n');
          });

          out.push(files.join('\n'));

          out.push('</ul>');

          res.send(out.join('\n') + '\n');
        }
      });
    });
  };
};

/**
 * Helpers
 */

var sort = function(obj) {
  return obj.sort(function(a, b) {
    a = a.toLowerCase()[0];
    b = b.toLowerCase()[0];
    return a > b ? 1 : (a < b ? -1 : 0);
  });
};

var escape = function(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};
