BIN = ./node_modules/.bin
REPORTER = spec
SPECS = test/*.spec.js test/**/*.spec.js

test:
	@NODE_ENV=test $(BIN)/mocha --reporter $(REPORTER) $(SPECS)

test-cov:
	@NODE_ENV=test $(BIN)/istanbul cover $(BIN)/_mocha -- --reporter $(REPORTER) $(SPECS)

clean:
	rm -rf coverage

install link:
	@npm $@

.PHONY: test test-cov clean install link
