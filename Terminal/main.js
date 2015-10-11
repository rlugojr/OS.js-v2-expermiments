/*!
 * OS.js - JavaScript Operating System
 *
 * Copyright (c) 2011-2015, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met: 
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer. 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution. 
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */
(function(Application, Window, Utils, API, VFS, GUI) {
  'use strict';

  var sessions = {};
  var socket;

  function destroySessions() {
    Object.keys(sessions).forEach(function(k) {
      if ( k && sessions[k] ) {
        try {
          sessions[k]._close();
        } catch ( e ) {}
        delete sessions[k];
      }
    });
  }

  function createSession(host, win) {
    createConnection(host, function() {
      socket.emit('spawn', function(id) {
        console.warn('SPAWNED TERMINAL ON SERVER WITH', id);

        win.id = id;
        sessions[id] = win;

        var size = win.getTerminalSize();
        if ( socket ) {
          socket.emit('resize', id, size.cols, size.rows);
        }
      });
    });
  }

  function createConnection(host, cb) {
    if ( socket ) {
      console.info('SOCKET OPEN ALREADY');
      cb();
      return;
    }

    socket = io.connect(host, {
      'max reconnection attempts': 10,
      'force new connection': true
    });

    socket.on('disconnect', function() {
      destroySessions();
      socket = null;
    });

    socket.on('connect', function() {

      /*
      socket.on('resize', function(x, y) {
        if ( term ) {
          term.resize(x, y);
        }
      });
      */

      socket.on('kill', function(id) {
        var win = sessions[id];
        if ( win ) {
          win._close();
        }
      });

      socket.on('data', function(id, data) {
        var win = sessions[id];
        if ( win ) {
          win.putTerminalData(data);
        }
      });

      cb();
    });
  }

  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  function ApplicationTerminalWindow(app, metadata, scheme) {
    Window.apply(this, ['ApplicationTerminalWindow', {
      icon: metadata.icon,
      title: metadata.name,
      width: 960,
      height: 288,
      key_capture : true
    }, app, scheme]);

    this.id = null;
    this.terminal = null;
    this.titleInterval = null;
    this.pingInterval = null;
    this.previousTitle = null;
    this.hostname = metadata.config.host;
  }

  ApplicationTerminalWindow.prototype = Object.create(Window.prototype);
  ApplicationTerminalWindow.constructor = Window.prototype;

  ApplicationTerminalWindow.prototype.init = function(wmRef, app, scheme) {
    var root = Window.prototype.init.apply(this, arguments);
    var self = this;

    // Load and set up scheme (GUI) here
    scheme.render(this, 'TerminalWindow', root);

    var size = this.getTerminalSize();
    var term = new Terminal({
      cols: size.cols,
      rows: size.rows,
      useEvents: false,
      screenKeys: true
    });

    function resize() {
      if ( term ) {
        var size = self.getTerminalSize();
        if ( socket && self.id ) {
          socket.emit('resize', self.id, size.cols, size.rows);
        }
        term.resize(size.cols, size.rows);
      }
    }

    this._addHook('resized', function() {
      resize();
    });

    this._addHook('maximize', function() {
      resize();
    });

    this._addHook('restore', function() {
      resize();
    });

    this.titleInterval = setInterval(function() {
      if ( socket && self.id ) {
        socket.emit('process', self.id, function(err, name) {
          if ( name ) {
            self.setTitle(name);
          }
        });
      }
    }, 1000);

    this.pingInterval = setInterval(function() {
      if ( socket && self.id ) {
        socket.emit('ping', self.id);
      }
    }, 30000);

    term.open(this._$root);
    //term.write('\x1b[31mWelcome to the OS.js Terminal. Type \'ssh\' to open a connection to the server...\x1b[m\r\n');

    term.on('data', function(data) {
      if ( socket && self.id ) {
        socket.emit('data', self.id, data);
      } else {
        emulateLocal(data);
      }
    });

    this.terminal = term;

    return root;
  };

  ApplicationTerminalWindow.prototype._inited = function() {
    Window.prototype._inited.apply(this, arguments);

    if ( this.terminal ) {
      this.terminal.startBlink();
      this.terminal.focus();
    }

    this.putTerminalData('... connecting to ' + this.hostname + '\r\n');
    createSession(this.hostname, this);
  };

  ApplicationTerminalWindow.prototype.destroy = function() {
    if ( this.titleInterval ) {
      this.titleInterval = clearInterval(this.titleInterval);
    }
    if ( this.pingInterval ) {
      this.pingInterval = clearInterval(this.pingInterval);
    }
    if ( socket && this.id ) {
      socket.emit('destroy', this.id);
    }
    if ( this.terminal ) {
      this.terminal.destroy();
    }
    if ( this.id && sessions[this.id] ) {
      delete sessions[this.id];
    }

    this.terminal = null;

    Window.prototype.destroy.apply(this, arguments);
  };

  ApplicationTerminalWindow.prototype.blur = function() {
    if ( Window.prototype.blur.apply(this, arguments) ) {
      if ( this.terminal ) {
        this.terminal.blur();
      }
      return true;
    }
    return false;
  };

  ApplicationTerminalWindow.prototype.focus = function() {
    if ( Window.prototype.focus.apply(this, arguments) ) {
      if ( this.terminal ) {
        this.terminal.focus();
      }
      return true;
    }
    return false;
  };

  ApplicationTerminalWindow.prototype._onKeyEvent = function(ev, type) {
    Window.prototype._onKeyEvent.apply(this, arguments);

    if ( this.terminal ) {
      if ( type === 'keydown' ) {
        this.terminal.keyDown(ev);
      } else if ( type === 'keypress' ) {
        this.terminal.keyPress(ev);
      }
      return false;
    }

    return true;
  };

  ApplicationTerminalWindow.prototype.setTitle = function(t) {
    var title = t;
    if ( this.terminal ) {
      var s = this.getTerminalSize();
      title += Utils.format(' [{0}x{1}]', s.cols, s.rows);
    }

    if ( title !== this.previousTitle ) {
      this._setTitle(title, true);
    }

    this.previousTitle = title;
  };

  ApplicationTerminalWindow.prototype.putTerminalData = function(d) {
    if ( this.terminal ) {
      this.terminal.write(d);
    }
  };

  ApplicationTerminalWindow.prototype.getTerminalSize = function() {
    return {
      cols: parseInt(Math.max(this._dimension.w / 7), 10),
      rows: parseInt(Math.min(this._dimension.h / 14), 10)
    };
    //return {cols: 80, rows: 24};
  };

  /////////////////////////////////////////////////////////////////////////////
  // APPLICATION
  /////////////////////////////////////////////////////////////////////////////

  function ApplicationTerminal(args, metadata) {
    Application.apply(this, ['ApplicationTerminal', args, metadata]);
  }

  ApplicationTerminal.prototype = Object.create(Application.prototype);
  ApplicationTerminal.constructor = Application;

  ApplicationTerminal.prototype.destroy = function() {
    var result = Application.prototype.destroy.apply(this, arguments);

    if ( !Object.keys(sessions).length ) {
      console.warn('ALL SESSIONS DESTROYED...CLOSING CONNECTION');
      if ( socket ) {
        socket.disconnect();
      }
      socket = null;
    }

    return result;
  };

  ApplicationTerminal.prototype.init = function(settings, metadata, onInited) {
    Application.prototype.init.apply(this, arguments);

    var self = this;
    var url = API.getApplicationResource(this, './scheme.html');
    var scheme = GUI.createScheme(url);

    scheme.load(function(error, result) {
      var win = self._addWindow(new ApplicationTerminalWindow(self, metadata, scheme));

      /*
      self._call('spawn', null, function(err, result) {
        //console.error("DXX", err, result);
      });
      */

      onInited();
    });


    this._setScheme(scheme);
  };

  /////////////////////////////////////////////////////////////////////////////
  // EXPORTS
  /////////////////////////////////////////////////////////////////////////////

  OSjs.Applications = OSjs.Applications || {};
  OSjs.Applications.ApplicationTerminal = OSjs.Applications.ApplicationTerminal || {};
  OSjs.Applications.ApplicationTerminal.Class = ApplicationTerminal;

})(OSjs.Core.Application, OSjs.Core.Window, OSjs.Utils, OSjs.API, OSjs.VFS, OSjs.GUI);
