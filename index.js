const path = require('path');

class devflow {
	
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
	
	log(...log){
		log.unshift("\x1b[31m"); //set fg color to red
		log.push("\x1b[0m"); //reset color
		console.log(...log);
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
		this.setEnv();
		this.handleExit();

		this.runBabel();
		this.runNodemon();
		this.runLivereload();
		
		this.watchWebpack();

	}
	
	runBabel(){
		this.log('babel - compilation');
		const { spawn, execSync } = require('child_process');
		let babelBin = path.resolve('node_modules/babel-cli/bin/babel.js');
		let args = [ this.options.srcPath, '-d',this.options.buildPath, '--copy-files', '--source-maps inline' ];
		execSync(babelBin+' '+args.join(' '), { stdio: 'inherit' });
		
		this.log('babel - start watcher');
		spawn( babelBin, [...args, '--watch','--skip-initial-build'], { stdio: 'inherit' } );
		
	}

	runNodemon(){
		this.log('nodemon - start');
		const nodemon = require('nodemon')({
			watch: [ this.options.buildPath ],
			script: this.options.serverScript,
		});
		const self = this;
		nodemon.on('restart',function(){
			self.log("nodemon restart \n");
		});
	}

	runLivereload(){
		this.log('livereload - start server');
		const livereload = require('livereload').createServer({
			delay: 500,
			applyCSSLive: true,
			applyImgLive: true,
			usePolling: true,
		});
		livereload.watch([ path.resolve(this.options.distPath) ]);
	}
	
	runWebpack(){
		this.log('webpack - compilation');
		const webpack = require('webpack');
		let config = require(path.resolve('webpack.config.js'));
		
		let lastHash;
		let outputOptions = { colors: { level: 2, hasBasic: true, has256: true, has16m: false } };
		
		//config.watch = true;
		
		webpack(config, function(err, stats) {
			if(err) {
				lastHash = null;
				console.error(err.stack || err);
				if(err.details) console.error(err.details);
				process.exit(1); // eslint-disable-line
			}
			if(stats.hash !== lastHash){
				lastHash = stats.hash;
				process.stdout.write(stats.toString(outputOptions) + "\n");
			}
			if(!config.watch && stats.hasErrors()) {
				process.on("exit", function() {
					process.exit(2); // eslint-disable-line
				});
			}
		});
	}
	
	watchWebpack(){
		this.log('webpack - start watcher');
		const watch = require('node-watch');
		const self = this;
		watch(this.options.buildPath, { recusive: true }, function(e, name){
			if(name.split('.').pop()!='js'){
				self.runWebpack();
			}
		});
	}
}

module.exports = devflow;
