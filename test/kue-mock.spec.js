'use strict';

const sinon = require('sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));
const expect = chai.expect;

const Q = require('q');

const kue = require('kue'),
      KueMock = require('../lib/kue-mock'),
      $queue = new KueMock(kue);

describe('KueMock', function () {
  var queue; // the original queue instance

  before('get the original queue', function () {
    queue = kue.createQueue();
  });

  describe('#stub', function () {
    it('generates a `JobStub` object', function () {
      expect($queue.stub('test job'))
        .to.be.an('object')
        .with.property('process')
        .that.is.a('function')
        .and.is.not.called;
    });

    it('generates a new object on each call', function () {
      expect($queue.stub('test job'))
        .to.not.equal($queue.stub('test job'));
    });
  });

  describe('#stub => JobStub', function () {
    var jobStub;

    describe('when a stubbed type job is queued', function () {
      beforeEach('stub job process', function () {
        jobStub = $queue.stub('job process stub');
      });

      it('calls through the process stub', function (done) {
        queue.create('job process stub')
          .on('complete', function () {
            expect(jobStub.process).to.have.been.called;
            done();
          })
          .on('failed', function (err) { done(err) })
          .save(function (err) { err && done(err) });
      });
    });

    describe('when a custom implementation is given', function () {
      var probe;

      beforeEach('setup the probe', function () {
        probe = sinon.stub().yields();
      });

      beforeEach('stub job process', function () {
        jobStub = $queue.stub('job process stub', probe);
      });

      it('calls through the given function', function (done) {
        queue.create('job process stub')
          .on('complete', function () {
            expect(probe).to.have.been.called;
            done();
          })
          .on('failed', function (err) { done(err) })
          .save(function (err) { err && done(err) });
      });
    });

    describe('when `#process` is replaced', function () {
      var probe;

      beforeEach('setup probe stub', function () {
        probe = sinon.stub().yields();
      });

      beforeEach('stub job process', function () {
        jobStub = $queue.stub('job process stub');
      });

      beforeEach('reassign `job.process`', function () {
        jobStub.process = probe;
      });

      it('calls through the replaced function', function (done) {
        queue.create('job process stub')
          .on('complete', function () {
            expect(probe).to.have.been.called;
            done();
          })
          .on('failed', function (err) { done(err) })
          .save(function (err) { err && done(err) });
      });
    });
  });

  describe('#clean', function () {
    function generateInactiveJob() {
      var deferred = Q.defer();

      queue.create('enqueued job for cleanup')
        .save(function (err) {
          if (err) {
            return deferred.reject(err);
          }

          deferred.resolve();
        });

      return deferred.promise;
    }

    function generateActiveJob() {
      var deferred = Q.defer();

      $queue.stub('active job for cleanup', function () {
        deferred.resolve();
      });

      queue.create('active job for cleanup')
        .save(function (err) {
          if (err) {
            return deferred.reject(err);
          }
        });

      return deferred.promise;
    }

    function generateCompletedJob() {
      var deferred = Q.defer();

      $queue.stub('completed job for cleanup');

      queue.create('completed job for cleanup')
        .on('complete', function () {
          deferred.resolve();
        })
        .on('failed', function (err) {
          deferred.reject(err);
        })
        .save(function (err) {
          if (err) {
            return deferred.reject(err);
          }
        });

      return deferred.promise;
    }

    function generateFailedJob() {
      var deferred = Q.defer();

      $queue.stub('failed job for cleanup', function (job, done) {
        done(new Error('Oops!'));
      });

      queue.create('failed job for cleanup')
        .on('failed', function () {
          deferred.resolve();
        })
        .on('complete', function () {
          deferred.reject(new Error('expected job to have been failed'));
        })
        .save(function (err) {
          if (err) {
            return deferred.reject(err);
          }
        });

      return deferred.promise;
    }

    it('returns a promise', function () {
      var promise = $queue.clean();

      expect(promise)
        .to.be.an('object')
        .with.property('then')
        .that.is.a('function');

      return promise;
    });

    it('handles a callback if given', function (done) {
      $queue.clean(done);
    });

    it('removes all kind of jobs', function () {
      function calculateJobs() {
        var total = 0;
        function add(count) {
          total += count;
        }

        return Q.all([
          (Q.denodeify(queue.inactiveCount.bind(queue))().then(add)),
          (Q.denodeify(queue.activeCount.bind(queue))().then(add)),
          (Q.denodeify(queue.completeCount.bind(queue))().then(add)),
          (Q.denodeify(queue.failedCount.bind(queue))().then(add))
        ])
          .then(function () {
            return total;
          });
      }

      return $queue.clean()
        .then(function () {
          return Q.all([
            generateInactiveJob(),
            generateActiveJob(),
            generateInactiveJob(),
            generateCompletedJob(),
            generateFailedJob(),
            generateCompletedJob(),
            generateFailedJob()
          ]);
        })
        .then(calculateJobs)
        .then(function (total) {
          expect(total).to.equal(7,
            'expected at least seven jobs to have been created');
        })
        .then(function () {
          return $queue.clean();
        })
        .then(calculateJobs)
        .then(function (total) {
          expect(total).to.equal(0, 'expected jobs to have been removed');
        });
    });

    describe('when the job counting query is failed', function () {
      beforeEach('stub `Queue#client.zcard` failure', function () {
        sinon.stub(queue.client, 'zcard')
          .yieldsAsync(new Error('zcard test failure'));
      });

      afterEach('restore `Queue#client.zcard`', function () {
        queue.client.zcard.restore();
      });

      it('rejects with an occurred error', function (done) {
        $queue.clean()
          .then(function () {
            done(new Error('expected `$queue.clean` to have been failed'));
          })
          .catch(function (err) {
            try {
              expect(err).to.be.an('error')
                .with.property('message', 'zcard test failure');
              done();
            }
            catch (e) {
              return done(e);
            }
          });
      });
    });

    describe('when the job fetching query is failed', function () {
      beforeEach('stub `Job.range` failure', function () {
        sinon.stub(kue.Job, 'range')
          .yieldsAsync(new Error('`Job.range` test failure'));
      });

      afterEach('restore `Job.range`', function () {
        kue.Job.range.restore();
      });

      it('rejects with an occurred error', function (done) {
        $queue.clean()
          .then(function () {
            done(new Error('expected `$queue.clean` to have been failed'));
          })
          .catch(function (err) {
            try {
              expect(err).to.be.an('error')
                .with.property('message', '`Job.range` test failure');
              done();
            }
            catch (e) {
              return done(e);
            }
          });
      });
    });

    describe('when one of the jobs removing is failed', function () {
      var $jobsResult;

      beforeEach('setup jobs result', function () {
        $jobsResult = [
          { remove: sinon.stub().yieldsAsync() },
          { remove: sinon.stub().yields(new Error('`Job#remove` test failure')) },
          { remove: sinon.stub().yieldsAsync() }
        ];
      });

      beforeEach('stub `Job.range` to return jobs result', function () {
        sinon.stub(kue.Job, 'range')
          .yieldsAsync(null, $jobsResult);
      });

      afterEach('restore `Job.range`', function () {
        kue.Job.range.restore();
      });

      it('rejects with an occurred error', function (done) {
        $queue.clean()
          .then(function () {
            done(new Error('expected `$queue.clean` to have been failed'));
          })
          .catch(function (err) {
            try {
              expect(err).to.be.an('error')
                .with.property('message', '`Job#remove` test failure');
              done();
            }
            catch (e) {
              return done(e);
            }
          });
      });

      it('goes through the all `Job#remove` methods anyway', function (done) {
        $queue.clean()
          .finally(function () {
            try {
              for (var i = 0; i < $jobsResult.length; i++) {
                expect($jobsResult[0].remove).to.have.been.called;
              }
              done();
            }
            catch (e) {
              done(e);
            }
          });
      });
    });
  });
});
