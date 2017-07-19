#!/usr/bin/env node

process.on('SIGINT', function(){ //catch CTRL+C and let's exit
	process.exit();
});

const devflow = new (require('../index'))();
devflow.run();
