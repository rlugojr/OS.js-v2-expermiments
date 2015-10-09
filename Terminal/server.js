(function() {

  var pty = require('pty.js');
  var app = require('http').createServer(handler)
  var io = require('socket.io')(app);
  var fs = require('fs');
  var term;

  app.listen(8080);

  function createSession() {
    if ( term ) {
      term.destroy();
    }

    term = pty.spawn('bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });

    term.on('data', function(data) {
      io.emit('data', data);
    });

    term.on('title', function(title) {
      io.emit('title', title);
    });

  }

  function handler(req, res) {
    fs.readFile(__dirname + '/index.html',
    function (err, data) {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }

      res.writeHead(200);
      res.end(data);
    });
  }

  io.on('connection', function (socket) {
    console.log('Incoming connection');

    //io.emit('data', '...creating shell...');

    socket.on('resize', function(x, y) {
      console.log('resize', x, y);
      if ( term ) {
        term.resize(x, y);
      }
    });

    socket.on('process', function(id, cb) {
      cb(false, 'null');
    });

    socket.on('data', function (data) {
      console.log('data', data);
      if ( term ) {
        term.write(data);
      }
    });

    createSession();
  });

})();
