/**
 * robots.txt
 */

/**
 * Usage:
 * app.use(
 *   vanilla.robots({
 *     'user-agent': '*',
 *     'disallow': ['/files', '/other'],
 *     'sitemap': '/sitemap.xml'
 *   })
 * );
 */

module.exports = function(opt) {
  var out = []
    , head
    , key;

  for (key in opt) {
    key = key[0].toUpperCase()
          + key.substring(1);
    out.concat.call(opt[key])
      .forEach(function(val) {
        out.push(key + ': ' + val);
      });
  }

  out = new Buffer(out.join('\n'));
  head = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': out.length,
    'Cache-Control': 'public, max-age=86400'
  };

  return function(req, res, next) {
    if (req.pathname === '/robots.txt') {
      if (req.httpVersionMinor < 1) {
        res.setHeader('Expires',
                      new Date(Date.now() + 86400000).toUTCString());
      }
      res.writeHead(200, head);
      res.end(out);
    } else {
      next();
    }
  };
};
