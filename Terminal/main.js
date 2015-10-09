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

  function createInstance(win, root, options) {
    options = options || {};

    function getSize() {
      if ( win ) {
        return {
          cols: parseInt(Math.max(win._dimension.w / 7), 10),
          rows: parseInt(Math.min(win._dimension.h / 14), 10)
        };
      }
      return {cols: 80, rows: 24};
    }

    var id;
    var term;
    var size = getSize();
    var socket = io.connect(win.host, {});

    socket.on('connect', function() {

      term = new Terminal({
        cols: size.cols,
        rows: size.rows,
        useEvents: false,
        screenKeys: true
      });

      term.startBlink();

      socket.emit('resize', size.cols, size.rows);

      win._addHook('resized', function() {
        if ( term ) {
          size = getSize();
          console.warn("window resized", size);
          socket.emit('resize', size.cols, size.rows);
          term.resize(size.cols, size.rows);
        }
      });

      term.on('data', function(data) {
        socket.emit('data', data);
      });

      term.open(root);

      term.write('\x1b[31mWelcome to term.js!\x1b[m\r\n');

      win.titleInterval = setInterval(function() {
        socket.emit('process', id, function(err, name) {
          if ( name ) {
            win.setTitle(name);
          }
        });
      }, 1000);

      // Socket
      socket.on('resize', function(x, y) {
        if ( term ) {
          term.resize(x, y);
        }
      });

      socket.on('data', function(data) {
        if ( term ) {
          term.write(data);
        }
      });

      socket.on('disconnect', function() {
        if ( term ) {
          term.destroy();
        }
      });
    });

    return {
      socket: socket,

      getSize: function() {
        return size;
      },

      input: function(type, ev) {
        if ( term ) {

          if ( type === 'keydown' ) {
            term.keyDown(ev);
          } else if ( type === 'keypress' ) {
            term.keyPress(ev);
          }

          return false;
        }
        return true;
      },

      blur: function() {
        if ( term ) {
          term.blur();
        }
      },

      focus: function() {
        if ( term ) {
          term.focus();
        }
      },

      destroy: function() {
        if ( term ) {
          term.destroy();
        }
        term = null;
      }
    };
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

    this.host = window.location.host;
    if ( metadata && metadata.config && metadata.config.host ) {
      this.host = metadata.config.host;
    }

    this.terminal = null;
    this.titleInterval = null;
  }

  ApplicationTerminalWindow.prototype = Object.create(Window.prototype);
  ApplicationTerminalWindow.constructor = Window.prototype;

  ApplicationTerminalWindow.prototype.init = function(wmRef, app, scheme) {
    var root = Window.prototype.init.apply(this, arguments);
    var self = this;

    // Load and set up scheme (GUI) here
    scheme.render(this, 'TerminalWindow', root);

    return root;
  };

  ApplicationTerminalWindow.prototype._inited = function() {
    Window.prototype._inited.apply(this, arguments);

    this.terminal = createInstance(this, this._$root, {
    });

    this.terminal.focus();
  };

  ApplicationTerminalWindow.prototype.destroy = function() {
    if ( this.titleInterval ) {
      this.titleInterval = clearInterval(this.titleInterval);
    }
    if ( this.terminal ) {
      this.terminal.destroy();
    }

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
      return this.terminal.input(type, ev);
    }

    return true;
  };

  ApplicationTerminalWindow.prototype.setTitle = function(t) {
    var title = t;
    if ( this.terminal ) {
      var s = this.terminal.getSize();
      title += Utils.format(' [{0}x{1}]', s.cols, s.rows);
    }

    this._setTitle(title, true);
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
    return Application.prototype.destroy.apply(this, arguments);
  };

  ApplicationTerminal.prototype.init = function(settings, metadata, onInited) {
    Application.prototype.init.apply(this, arguments);

    var self = this;
    var url = API.getApplicationResource(this, './scheme.html');
    var scheme = GUI.createScheme(url);
    scheme.load(function(error, result) {
      self._addWindow(new ApplicationTerminalWindow(self, metadata, scheme));
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
