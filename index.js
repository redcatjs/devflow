const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');
const chalk = require('chalk');
const http = require('http');
const hashFiles = require('hash-files');
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const DotenvWebpack = require('dotenv-webpack');

process.NODE_ENV = 'developement';

class devflow {
	
	constructor(options){
		options = options || {};
		this.options = {
			srcPath: 'app',
			distServer: 'dist.server',
			distServerScript: 'server.js',
			distClient: 'dist.client',
			distClientScript: 'client.js',
			publicPath: 'assets/',
			serverPort: 3000,
		};
		Object.keys(options).forEach(function(k){
			this.options[k] = options[k];
		});
		this.nodeOnline = false;
		this.liveReloadPaths = [];
	}
	
	log(...params){
		params.forEach(function(param){
			console.log( chalk.cyan(param) );
		});
	}
	
	waitForNodeOnline(){
		if(this.waitForNodeOnlineReq){
			return;
		}
		let done;
		this.waitForNodeOnlineReq = http.get({
			host: 'localhost',
			path: '',
			port: this.options.serverPort,
		}, function(res) {
			done = true;
			this.waitForNodeOnlineReq = false;
			if(res.statusCode==200){
				this.nodeOnline = true;
				this.log('node server online');
			}
			else{
				setTimeout(function(){
					this.waitForNodeOnline();
				}.bind(this),300);
			}
		}.bind(this))
			.on('error',function(){
				setTimeout(function(){
					this.waitForNodeOnline();
				}.bind(this),300);
			}.bind(this))
		;
		setTimeout(function(){
			if(!done){
				this.waitForNodeOnlineReq.abort();
				this.waitForNodeOnlineReq = false;
				this.waitForNodeOnline();
			}
		}.bind(this),300);
	}
	
	run(){
		this.writeDistRevision();
		this.runBabel();
		this.runNodemon();
		this.runLivereload();
		this.runWebpack();
	}
	
	runBabel(){
		this.log('babel - compilation');
		let babelBin = path.resolve('node_modules/babel-cli/bin/babel.js');
		let args = [ this.options.srcPath, '-d',this.options.distServer, '--copy-files', '--source-maps inline' ];
		execSync(babelBin+' '+args.join(' '), { stdio: 'inherit' });
		
		this.log('babel - start watcher');
		spawn( babelBin, [...args, '--watch','--skip-initial-build'], {
			stdio: 'inherit'
		} );
		
	}

	runNodemon(){
		this.log('nodemon - start');
		const nodemon = require('nodemon')({
			watch: [ this.options.distServer ],
			script: path.join(this.options.distServer,this.options.distServerScript),
			env: Object.assign({},process.env,{
				NODE_PATH: this.options.distServer,
				//DEBUG: 'socket.io*',
			}),
		});
		nodemon.on('restart',function(){
			this.log("nodemon restart \n");
			this.nodeOnline = false;
		}.bind(this));
		nodemon.on('start',function(){
			this.waitForNodeOnline();
		}.bind(this));
	}

	runLivereload(){
		this.log('livereload - start server');
		const livereload = require('livereload').createServer({
			applyCSSLive: true,
			applyImgLive: true,
		});
		
		const chokidar = require('chokidar');
		let reloader;
		let hashMap = {};
		let reload = function(path){
			this.liveReloadPaths.push(path);
			if(reloader){
				clearInterval(reloader);
			}
			reloader = setInterval(function(){
				if(this.nodeOnline){
					clearInterval(reloader);
					
					if(this.liveReloadPaths.length){
						this.log('send livereload to browser');
						while(this.liveReloadPaths.length){
							let fpath = this.liveReloadPaths.shift();
							livereload.filterRefresh( fpath );
						}
					}
				}
			}.bind(this),100);
		}.bind(this);
		chokidar.watch([ path.resolve(this.options.distClient) ], {
			ignoreInitial: true,
			usePolling: false,
			awaitWriteFinish: true,
		})
			.on('add', reload)
			.on('unlink', reload)
			.on('change', function(path){
				hashFiles({files:[path]}, function(error, hash) {
					if(!hashMap[path]||hashMap[path]!=hash){
						hashMap[path] = hash;
						reload(path);
					}
				});
			})
		;
	}
	
	runWebpack(){
		
		this.log('webpack - compilation + start watcher');
		
		this.runWebpackCLI();
		//this.runWebpackNode();
		
	}
	
	runWebpackCLI(){
		spawn( path.resolve('node_modules/webpack/bin/webpack.js'), ['--watch'], {
			stdio: 'inherit',
		} );
	}
	runWebpackNode(){
		let config = require(path.resolve('webpack.config.js'));
		
		let lastHash;
		let outputOptions = { colors: { level: 2, hasBasic: true, has256: true, has16m: false } };
		
		config.watch = true;
		
		webpack(config, function(err, stats) {
			if(err) {
				lastHash = null;
				console.error(err.stack || err);
				if(err.details) console.error(err.details);
				process.exit(1);
			}
			if(stats.hash !== lastHash){
				lastHash = stats.hash;
				process.stdout.write(stats.toString(outputOptions) + "\n");
			}
			if(!config.watch && stats.hasErrors()) {
				process.on('exit', function(){
					process.exit(2);
				});
			}
		});
	}
	
	
	webpackConfig(config, extra){
		process.env.NODE_ENV = process.env.NODE_ENV || "development";

		let configDefault = {
			
			context: path.resolve(process.cwd(), this.options.srcPath),
			entry: {
				app: [ './'+this.options.distClientScript ],
			},
			output: {
				path: path.resolve(this.options.distClient),
				filename: this.revisionFile('[name].js'),
				publicPath: this.options.publicPath,
			},
			
			resolve: {
				symlinks: true,
				alias: {},
				modules: [
					this.options.srcPath,
					'node_modules',
				],
			},
			
			node: {
				fs: 'empty'
			},
			
			plugins: [
				new webpack.DefinePlugin({
					'process.env': {
						APP_ENV: JSON.stringify('browser'),
					}
				}),
				new DotenvWebpack(),
				new webpack.optimize.CommonsChunkPlugin({
					name: 'vendor',
					filename: this.revisionFile("vendor.js"),
					minChunks: function(module) {
						return module.resource && ( /node_modules/.test(module.resource) || /vendor/.test(module.resource) );
					}
				}),			
				new ExtractTextPlugin( this.revisionFile( '[name].css' ) ),
			],
			
			module: {
				rules: [
					{
						test: /\.js?$/,
						exclude: /node_modules/,
						loader: "babel-loader",
						query: {
							plugins: [
								'transform-class-properties',
								'transform-runtime'
							],
							presets: ['stage-0']
						}
					},
					{
						test: /\.php$/,
						use: [
							{
								loader: 'webpack-php-loader',
								options: {
									//debug: true
								}
							}
						]
					},
					{
						test: /\.css$/,
						use: ExtractTextPlugin.extract({
							fallback: 'style-loader',
							use: 'css-loader',
						}),
					},
					{
						test: /\.(sass|scss)$/,
						use: ExtractTextPlugin.extract({
							fallback: 'style-loader',
							use: [
								'css-loader',
								'sass-loader',
							]
						}),
					},
					{
						test: /\.json$/,
						loader: "json-loader"
					},
					{
						test: /\.(jpg|png|svg|eot|ttf|woff|woff2)$/,
						use: [{
							loader: 'file-loader',
							options: {
								name: '[name].[hash].[ext]',
								outputPath: '',
								publicPath: '',
							}
						}],
					},
					
					{
						test: /\.(ejs)$/,
						use: [{
							loader: 'ejs-compiled-loader',
							options: {
								htmlmin: true, // or enable here  
								htmlminOptions: {
									removeComments: true
								}
							}
						}],
					},
					
					{
						test: /\.(html)$/,
						use: [{
							loader: 'html-loader',
							options: {
								minimize: true
							}
						}],
					},
				],
			},
		};

		if(process.env.NODE_ENV==="production"){
			configDefault.devtool = 'source-map';
		}
		else{
			configDefault.devtool = 'eval-cheap-module-source-map';
		}
		
		config = webpackMerge(configDefault, config || {});
		
		if(extra){
			if(extra.shimDependencies){
				this.shimDependencies(config, extra.shimDependencies);
			}
			
			if(extra.exposeJquery){
				config.plugins.push(new webpack.ProvidePlugin({
					"$": 'jquery',
					"jQuery": 'jquery',
					"window.$": "jquery",
					"window.jQuery": "jquery",
				}));
				config.module.rules.push({
					test: require.resolve('jquery'),
					use: [{
						  loader: 'expose-loader',
						  options: 'jQuery'
					  },{
						  loader: 'expose-loader',
						  options: '$'
					  }]
				});
			}
			
			if(extra.disableAMD){
				//disable AMD resolution for AMD/CJS module names mismatching (broken AMD)
				if(extra.disableAMD===true){
					//disable global AMD
					config.module.rules.push({
						test: /\.js/,
						loader: 'imports-loader',
						query:'define=>false',
					});
				}
				else{
					//disable specifics AMD
					extra.disableAMD.forEach(function(lib){
						config.module.rules.push({
							test: require.resolve(lib),
							loader: 'imports-loader',
							query:'define=>false',
						});
					});
				}
			}
			
			
			if(extra.writeDistRevision){
				this.writeDistRevision();
			}
			
			if(extra.debugConfig){
				console.log(JSON.stringify(config, null, 2));
			}
		}
		
		
		return config;
	}
	
	getRevision(){
		if(!this.revision){
			this.revision = execSync('git rev-parse --short HEAD').toString().trim();
		}
		return this.revision;
	}
	revisionFile(file){
		let x = file.split('.');
		let ext = x.pop();
		file = x.join('.')+'.'+this.getRevision()+'.'+ext;
		return file;
	}
	makeDistPath(){
		const distClient = this.options.distClient;
		if(!fs.existsSync(distClient)){
			fs.mkdirSync(distClient);
		}
	}
	writeDistRevision(){
		this.makeDistPath();
		fs.writeFile(this.options.distClient+'/.revision', this.getRevision(), function (err) {
			if(err){
				throw err;
			}
		});
	}
	
	resolveRelativePath(file, enforceAbsolute){
		if(file.substr(0,2)=='./'||file.substr(0,3)=='../'){
			file = path.resolve(file);
		}
		else if(enforceAbsolute){
			file = require.resolve(file);
		}
		return file;
	}
	
	shimDependencies(webpackConfig, dependencies){
		Object.keys(dependencies).forEach(function(key){
			let deps = dependencies[key];
			let file = webpackConfig.resolve.alias[key] || key;
			file = this.resolveRelativePath(file, true);
			let query = {};
			deps.forEach(function(dep,i){
				dep = this.resolveRelativePath(dep);
				let k = '__required._'+i;
				query[k] = dep;
			}.bind(this));
			webpackConfig.module.rules.push({
				test: file,
				loader: 'imports-loader',
				query: query,
			});
		}.bind(this));
	}
	
}

module.exports = devflow;
