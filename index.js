const path = require('path');

class devbox {
	
	constructor(options){
		options = options || {};
		this.options = {
			srcPath: 'app',
			buildPath: 'app.build',
			distPath: 'app.dist',
			serverScript: 'app.build/server.js',
		};
		Object.keys(options).forEach(function(k){
			this.options[k] = options[k];
		});
	}
	
	setEnv(){
		process.env.NODE_ENV = 'developement';
		process.env.NODE_PATH = this.options.buildPath;
	}
	
	handleExit(){
		process.on('SIGINT', function(){ //catch CTRL+C and let's exit
			process.exit();
		});
	}
	
	run(){
		let self = this;
		this.setEnv();
		this.handleExit();

		this.runBabel();
		setTimeout(function(){
			self.runNodemon();
		},1000);
		this.runLivereload();

	}
	
	runBabel(){
		const { exec } = require('child_process');
		exec( path.resolve('node_modules/babel-cli/bin/babel.js')+' '+this.options.srcPath+' -d '+this.options.buildPath+' --watch --copy-files --source-maps inline' , function (error, stdout, stderr) {
			console.log('stdout: ' + stdout);
			console.log('stderr: ' + stderr);
			if (error !== null) {
				console.log('exec error: ' + error);
			}
		});
	}

	runNodemon(){
		//var cli = require('nodemon/lib/cli');
		//var options = cli.parse(process.argv);
		const nodemon = require('nodemon')({
			watch: [ this.options.buildPath ],
			script: this.options.serverScript,
		});
		nodemon.on('restart',function(){
			console.log("nodemon restart \n");
		});
	}

	runLivereload(){
		const livereload = require('livereload').createServer();
		livereload.watch([ path.resolve(this.options.distPath) ]);
	}
	
	runWebpack(){
		const webpack = require('webpack');
		let webpackConfig = require(path.resolve('webpack.config.js'));
		let webpackCompiler = webpack(webpackConfig);
		
		let lastHash;
		let outputOptions = { colors: { level: 2, hasBasic: true, has256: true, has16m: false } };
		function compilerCallback(err, stats) {
			if(!webpackConfig.watch || err) {
				// Do not keep cache anymore
				webpackCompiler.purgeInputFileSystem();
			}
			if(err) {
				lastHash = null;
				console.error(err.stack || err);
				if(err.details) console.error(err.details);
				process.exit(1); // eslint-disable-line
			}
			if(stats.hash !== lastHash) {
				lastHash = stats.hash;
				process.stdout.write(stats.toString(outputOptions) + "\n");
			}
			if(!webpackConfig.watch && stats.hasErrors()) {
				process.on("exit", function() {
					process.exit(2); // eslint-disable-line
				});
			}
		}
		
		webpackCompiler.run(compilerCallback);
	}
}

module.exports = devbox;
