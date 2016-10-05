'use strict';

var sinon = require('sinon'),
    Q = require('q');

var queue, typeMap = {};

function JobProcessStub(type, fn) {
  if (!typeMap.hasOwnProperty(type)) {
    queue.process(type, function (job, complete) {
      typeMap[type].process(job, complete);
    });
  }

  this.process = (fn || sinon.stub().yields());

  typeMap[type] = this;
}

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
