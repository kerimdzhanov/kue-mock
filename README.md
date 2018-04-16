# Kue Mock

[![Build Status](https://travis-ci.org/kerimdzhanov/kue-mock.svg?branch=master)](https://travis-ci.org/kerimdzhanov/kue-mock)

A small stubbing/mocking library for testing code that deals with [kue](https://github.com/Automattic/kue).

The library doesn't hack on any kue's internals (replacing/overriding methods etc.).
Instead, it creates the original queue instance with a separate redis namespace,
then, when stubbing, it creates job process handlers on the fly, putting its own
implementation that gives you the ability to control the job processing behaviour.


## Installation

    $ npm install kue-mock --save-dev


## Usage

```js
const kue = require('kue');
const KueMock = require('kue-mock');
const $queue = new KueMock(kue);

describe('functionality that deals with kue', () => {
  let $stub;

  beforeEach(() => {
    return $queue.clean(); // for test case isolation
  });

  beforeEach(() => {
    $stub = $queue.stub('job type');
  });

  afterEach(() => {
    $stub.restore(); // for test case isolation
  });

  // your tests goes here (see examples below)
});
```

## API

### `KueMock`

##### `new KueMock(kue [, options])` (constructor)

Creates a kue's JobQueue instance internally specifying a custom jobs namespace for environmental isolation.

_Important Note:_ kue's `.createQueue()` is designed to return a singleton object,
so you're required to create a `KueMock` instance before including any code that calls `kue.createQueue`.

You can also pass your custom redis options as a second argument if you need.

##### `#clean()`

Cleanup all the enqueued/completed/failed/stuck jobs.
It's highly recommended to call this function inside the `beforeEach` block to make your test cases isolated from each other.

This method supports both `Promise` and `callback` styles, so you can do:

```js
beforeEach(function (done) {
  $queue.clean(done); // providing `done` as a callback
});

// or in ES6 Promises style
beforeEach(() => $queue.clean()); // returning a `Promise`
```

##### `#stub(type [, impl])`

Stubs a job process returning a `JobStub` object for controlling it.

###### @return `JobStub`

### `JobStub`

##### `#process`

This is actually a `sinon.stub()` that is set up as a default implementation of the job process.
It allows you to get all benefits sinon.js' stubbing/mocking features in setting up the job behaviour.
Or you can even replace it with your own implementation on the fly.

Here are a few usage examples:

```js
let $stub = $queue.stub('job type');

$stub.yields(null, { foo: 'bar' }); // completes the job with results
$stub.yields(new Error('Oops!')); // fails the job providing a reason

// assertions and expectations
$stub.process.should.be.called(); // using `should-sinon`
expect($stub).to.have.been.called; // using `sinon-chai`

// you can also provide your custom process implementation
let $stub = $queue.stub('job type', (job, done) => {
  done(null, { foo: 'bar' });
});

// or simply replace the #process property
$stub.process = function (job, done) {
  // your own process handling...
  done(null, { foo: 'bar' });
};
```

###### @return `sinon.stub()`

##### `#restore`

Unregister the job process stub.
Make sure that you've called this after your stubbing test cases to isolate them from each other.

### TODO: $stub.process setup sugar
##### `JobStub#completes()`
##### `JobStub#completesWith(result)`
##### `JobStub#fails()`
##### `JobStub#failsWith(reason)`


## Examples

```js
const {expect} = require('chai');

const kue = require('kue');
const KueMock = require('kue-mock');
const $queue = new KueMock(kue);

const {yourJobRunnerFunction} = require('./your-lib-file');

describe('functionality that deals with kue', () => {
  before(() => $queue.clean());
  afterEach(() => $queue.clean());

  it('enqueues a job providing some correct data', () => {
    let jobData;

    const $stub = $queue.stub('your job type', (job, done) => {
      jobData = job.data;
      done();
    });

    return yourJobRunnerFunction()
      .then(() => {
        expect(jobData).to.be.an('object')
          .that.is.eql({ foo: 'bar' });
      })
      .finally(() => {
         $stub.restore(); // unregister the job stub to isolate test cases
      });
  });

  describe('when the job is completed', () => {
    let $stub;

    beforeEach('stub job process result', () => {
      $stub = $queue.stub('your job type')
        .yields(null, { baz: 'qux' });
    });

    afterEach(() => $stub.restore());

    it('correctly handles the result', () => {
      return yourJobRunnerFunction()
        .then((result) => {
          expect(result).to.eql({ baz: 'qux' });
        });
    });

    // ...
  });

  describe('when the job is failed', () => {
    let $stub;

    beforeEach('stub job process failure', () => {
      $stub = $queue.stub('your job type')
        .yields(new Error('Oops!'));
    });

    afterEach(() => $stub.restore());

    it('correctly handles the job result', () => {
      return yourJobRunnerFunction()
        .catch((err) => {
          expect(err).to.be.an('error')
            .with.property('message', 'Oops!');
        });
    });

    // ...
  });
});
```


## Contributing

__Your contributions are very welcome!__

When contributing, follow the simple rules:

* Don't violate [DRY](http://programmer.97things.oreilly.com/wiki/index.php/Don%27t_Repeat_Yourself) principles.
* [Boy Scout Rule](http://programmer.97things.oreilly.com/wiki/index.php/The_Boy_Scout_Rule) needs to have been applied.
* Your code should look like all the other code – this project should look like it was written by one man, always.
* If you want to propose something – just create an issue and describe your question with as much description as you can.
* If you think you have some general improvement, consider creating a pull request with it.
* If you add new code, it should be covered by tests. No tests - no code.
* If you find a bug (or at least you think it is a bug), create an issue with the library version and test case that we can run and see what are you talking about, or at least full steps by which we can reproduce it.


## Running tests

    $ make test


## License

MIT &copy; 2016 Dan Kerimdzhanov
