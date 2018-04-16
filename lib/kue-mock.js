'use strict';

var sinon = require('sinon'),
    Q = require('q');

var queue;

/**
 * Kue currently doesn't support process unregistration,
 * that's why we need to use this dirty hack here.
 * @type {Object<String, JobProcessStub>}
 */
var jobProcessStubMap = {};

function registerJob(jobProcessStub) {
  var type = jobProcessStub.type;

  if (!jobProcessStubMap.hasOwnProperty(type)) {
    queue.process(type, function (job, done) {
      if (jobProcessStubMap.hasOwnProperty(type)) {
        jobProcessStubMap[type].process(job, done);
      }
    });
  }

  jobProcessStubMap[type] = jobProcessStub;
}

function unregisterJob(jobProcessStub) {
  delete jobProcessStubMap[jobProcessStub.type];
}

function JobProcessStub(type, fn) {
  this.type = type;
  this.process = (fn || sinon.stub().yields());

  registerJob(this);
}

JobProcessStub.prototype.restore = function () {
  unregisterJob(this);
};

module.exports = function KueMock(kue, options) {
  options || (options = {});

  if (!options.prefix) {
    options.prefix = 'kue-mock';
  }

  queue = kue.createQueue(options);

  return {
    /**
     * Stub the job process.
     *
     * @param {string} type – job type
     * @param {function(job, done)} [fn] – custom implementation
     * @return {JobProcessStub}
     */
    stub: function (type, fn) {
      return new JobProcessStub(type, fn);
    },

    /**
     * Cleanup (enqueued/active/completed/failed) jobs.
     *
     * @param {function} [done] – the optional callback
     * @return {Promise} that's resolved when cleanup is completed
     */
    clean: function (done) {
      var deferred = Q.defer();

      queue.client.zcard(queue.client.getKey('jobs'), function (err, count) {
        if (err) {
          return deferred.reject(err);
        }

        kue.Job.range(0, count, 'asc', function (err, jobs) {
          if (err) {
            return deferred.reject(err);
          }

          Q.all(jobs.map(function (job) {
            return Q.denodeify(job.remove.bind(job))();
          }))
            .then(deferred.resolve)
            .catch(deferred.reject);
        });
      });

      return deferred.promise.nodeify(done);
    }
  };
};
