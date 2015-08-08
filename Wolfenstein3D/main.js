(function(IFrameApplicationWindow, Application, Window, GUI, Dialogs, Utils, API, VFS) {


  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Main Window Constructor
   */
  var ApplicationWolfensteinWindow = function(app, metadata) {
    var src = API.getApplicationResource(app, 'data/index.html');

    IFrameApplicationWindow.apply(this, ['ApplicationWolfensteinWindow', {
      src: src,
      focus: function(frame, win) {
        win.postMessage('resume', window.location.href);
      },
      blur: function(frame, win) {
        win.postMessage('pause', window.location.href);
      },
      icon: metadata.icon,
      title: metadata.name,
      width: 640,
      height: 400,
      allow_resise: false,
      allow_restore: false,
      allow_maximize: false
    }, app]);
  };

  ApplicationWolfensteinWindow.prototype = Object.create(IFrameApplicationWindow.prototype);

  /////////////////////////////////////////////////////////////////////////////
  // APPLICATION
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Application constructor
   */
  var ApplicationWolfenstein = function(args, metadata) {
    Application.apply(this, ['ApplicationWolfenstein', args, metadata]);
  };

  ApplicationWolfenstein.prototype = Object.create(Application.prototype);

  ApplicationWolfenstein.prototype.init = function(settings, metadata) {
    Application.prototype.init.apply(this, arguments);
    this._addWindow(new ApplicationWolfensteinWindow(this, metadata));
  };

  //
  // EXPORTS
  //
  OSjs.Applications = OSjs.Applications || {};
  OSjs.Applications.ApplicationWolfenstein = OSjs.Applications.ApplicationWolfenstein || {};
  OSjs.Applications.ApplicationWolfenstein.Class = ApplicationWolfenstein;

})(OSjs.Helpers.IFrameApplicationWindow, OSjs.Core.Application, OSjs.Core.Window, OSjs.GUI, OSjs.Dialogs, OSjs.Utils, OSjs.API, OSjs.VFS);
