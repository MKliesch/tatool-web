'use strict';

/* global Papa */
/* global async */

angular.module('tatool.module')
  .service('executableUtils', [ '$q', '$http', '$log', function ($q, $http, $log) {

    var utils = {};

    var executor = {};

    var token = '';

    var mode = '';

    /**--------------------------------
      General Executable functions
    -------------------------------- */
    // initialize the common executable service
    utils.init = function(runningExecutor, moduleToken, moduleMode) {
      executor = runningExecutor;
      token = moduleToken;
      mode = moduleMode;
    };

    // returns empty constructor for an executable
    utils.createExecutable = function() {
      return function() { };
    };

    // stops the execution of the current executable
    utils.stop = function() {
      executor.stopExecutable();
    };

    // suspend the current executable
    utils.suspend = function() {
      executor.suspendExecutable();
    };

    // fail the current executable and stop module
    utils.fail = function(error) {
      executor.failExecutable(error);
    };

    // stop the execution of the current module
    utils.stopModule = function(sessionComplete) {
      sessionComplete = (sessionComplete) ? sessionComplete : true;
      executor.finishExecutable();
      executor.stopModule(sessionComplete);
    };

    // create a new promise by using the $q service (abstraction for users)
    utils.createPromise = function() {
      return $q.defer();
    };

    /**--------------------------------
      Timing Helper functions
    -------------------------------- */

    // provide the current time in sub-millisecond resolution and such that it is not subject to system clock skew or adjustments
    utils.getTiming = function() {
      // Returns the number of milliseconds elapsed since either the browser navigationStart event or
      // the UNIX epoch, depending on availability.
      // Where the browser supports 'performance' we use that as it is more accurate (microsoeconds
      // will be returned in the fractional part) and more reliable as it does not rely on the system time.
      // Where 'performance' is not available, we will fall back to Date().getTime().
      var performance = window.performance || {};
      performance.now = (function() {
        return performance.now    ||
        performance.webkitNow     ||
        performance.msNow         ||
        performance.oNow          ||
        performance.mozNow        ||
        function() { return Date.now(); };
      })();
      return performance.now();
    };

    /**--------------------------------
      Resource Loading Helper functions
    -------------------------------- */

    utils.getResourcePath = function(res) {
      return getResourcePath(res);
    };

    var getResourcePath = function(res) {
      if (!res.project) {
        $log.error('Could not get resource path due to missing project information for resource: ', res);
        utils.fail('Could not get resource path due to missing project information for resource: ' + JSON.stringify(res));
        return null;
      }
      if (res.project.access === 'external') {
        if (res.resourcePath) {
          return res.resourcePath + res.resourceName;
        } else {
          return res.resourceName;
        }
      } else {
        var path = '/' + mode + '/resources/' +  res.project.access + '/' + res.project.name + '/';
        return path + res.resourceType + '/' + res.resourceName + '?token=' + token;
      }
    };

    // get a resource (project or external)
    utils.getResource = function(res) {
      if (res && res.project) {
        if (res.project.access === 'external') {
          return getExternalResource(res.resourceName);
        } else {
          return getProjectResource(res);
        }
      } else {
        return $q.reject('Resource not found: undefined');
      }
    };

    var getProjectResource = function(res) {
      var deferred = $q.defer();

      var path = '/' + mode + '/resources/' +  res.project.access + '/' + res.project.name + '/';

      $http.get( path + res.resourceType + '/' + res.resourceName + '?token=' + token)
        .success(function (data) {
          deferred.resolve(data);
        })
        .error(function (error) {
          deferred.reject(error);
        });

      return deferred.promise;
    };

    var getExternalResource = function(resUrl) {
      var deferred = $q.defer();

      $http.get(resUrl)
        .success(function (data) {
          deferred.resolve(data);
        })
        .error(function (error) {
          deferred.reject(error);
        });

      return deferred.promise;
    };

    // get a CSV resource (project or external)
    utils.getCSVResource = function(res, header, stimuliPath) {
      if (res && res.project) {
        if (res.project.access === 'external') {
          return getExternalCSVResource(res.resourceName, header, stimuliPath);
        } else {
          return getProjectCSVResource(res, header, stimuliPath);
        }
      } else {
        return $q.reject('Resource not found: undefined');
      }
    };

    var getProjectCSVResource = function(res, header, stimuliPath) {
      var deferred = $q.defer();
      if (!header) {
        header = false;
      }

      var path = '/' + mode + '/resources/' +  res.project.access + '/' + res.project.name + '/';

      $http.get( path + res.resourceType + '/' + res.resourceName + '?token=' + token)
        .success(function (data) {
          var csv = Papa.parse(data, {header: header, dynamicTyping: true, skipEmptyLines: true});
          if (header && stimuliPath) {
            getImages(csv.data, deferred, stimuliPath);
          } else {
            deferred.resolve(csv.data);
          }
        })
        .error(function (error) {
          deferred.reject(error);
        });

      return deferred.promise;
    };

    var getExternalCSVResource = function(resUrl, header, stimuliPath) {
      var deferred = $q.defer();
      if (!header) {
        header = false;
      }

      $http.get(resUrl)
        .success(function (data) {
          var csv = Papa.parse(data, {header: header, dynamicTyping: true, skipEmptyLines: true});
          if (header && stimuliPath) {
            getImages(csv.data, deferred, stimuliPath);
          } else {
            deferred.resolve(csv.data);
          }
        })
        .error(function (error) {
          deferred.reject(error);
        });

      return deferred.promise;
    };

    // loops through a stimuli file and collects all image file names
    var getImages = function(list, deferred, stimuliPath) {
      var images = [];
      async.each(list, function(stimulus, callback) {
        angular.forEach(stimulus, function(value, key) {
          if (key.indexOf('stimulusValueType') >= 0 && value === 'image') {
            if (images.indexOf(stimulus[key.replace('Type', '')]) === -1) {
              images.push(stimulus[key.replace('Type', '')]);
            }
          } else if (key.indexOf('keyLabelType') >= 0 && value === 'image') {
            if (images.indexOf(stimulus[key.replace('Type', '')]) === -1) {
              images.push(stimulus[key.replace('Type', '')]);
            }
          }
        });
        callback();
      }, function(err) {
        if( err ) {
          deferred.reject(err);
        } else {
          if (images.length > 0) {
            preloadImages(list, images, deferred, stimuliPath);
          } else {
            deferred.resolve(list);
          }
        }
      });
    };

    // preloads images
    var preloadImages = function(list, images, deferred, stimuliPath) {
      async.each(images, function(image, callback) {
        var img = new Image();
        var resource = stimuliPath;
        resource.resourceName = image;
        img.src = getResourcePath(resource);
        callback();
      }, function(err) {
        if( err ) {
          deferred.reject(err);
        } else {
          deferred.resolve(list);
        }
      });
    };


    /**--------------------------------
      Stimuli Selection Helper functions
    -------------------------------- */

    // returns a random int out of the specified interval
    utils.getRandomInt = function(min, max) {
      return Math.floor(Math.random()*(max-min+1)+min);
    };

    // returns a random element of an array or random property of an object without replacement
    utils.getRandom = function(obj) {
      var index;
      if (Array.isArray(obj)) {
        if (obj.length === 0) {
          return null;
        } else {
          index = utils.getRandomInt(0, obj.length - 1);
          return obj.splice(index, 1)[0];
        }
      } else {
        var array = Object.keys(obj);
        if (array.length === 0) {
          return null;
        } else {
          index = utils.getRandomInt(0, array.length - 1);
          var property = obj[array[index]];
          delete obj[array[index]];
          return property;
        }
      }
    };

    // returns a random element of an array or random property of an object with replacement
    utils.getRandomReplace = function(obj) {
      var index;
      if (Array.isArray(obj)) {
        if (obj.length === 0) {
          return null;
        } else {
          index = utils.getRandomInt(0, obj.length - 1);
          return obj[index];
        }
      } else {
        var array = Object.keys(obj);
        if (array.length === 0) {
          return null;
        } else {
          index = utils.getRandomInt(0, array.length - 1);
          return obj[array[index]];
        }
      }
    };

    // returns the next element of an array or next property of an object with replacement
    utils.getNext = function(obj, counter) {
      if (Array.isArray(obj)) {
        if (obj.length === 0) {
          return null;
        } else {
          return obj[counter];
        }
      } else {
        var array = Object.keys(obj);
        if (array.length === 0) {
          return null;
        } else {
          return obj[array[counter]];
        }
      }
    };

    // Shuffle array using Fisher-Yates algorithm
    utils.shuffle = function(array) {
      for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
      return array;
    };

    return utils;
  }]);
