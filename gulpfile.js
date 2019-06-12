/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const url = require("url");

const del = require("del");
const gulp = require("gulp");
const eslint = require("gulp-eslint");
const htmlhint = require("gulp-htmlhint");
const sass = require("gulp-sass");
const stylelint = require("gulp-stylelint");
const merge = require("merge-stream");
const zip = require("gulp-zip");
const webpackStream = require("webpack-stream");
const mergeConfig = require("webpack-merge");
const VueLoaderPlugin = require("vue-loader/lib/plugin");

const utils = require("./gulp-utils");

const webpackBaseConfig = {
  mode: "production",
  optimization: {
    minimize: false
  },
  node: {
    process: false,
    global: false,
    setImmediate: false
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: {
          loader: "vue-loader",
          options: {
            transformAssetUrls: {img: []},
            compilerOptions: {
              whitespace: "condense"
            }
          }
        }
      }
    ]
  },
  plugins: [new VueLoaderPlugin()],
  externals: {
    vue: "Vue",
    jsqr: "JSQR",
    zxcvbn: "zxcvbn"
  }
};

function webpack(config)
{
  return webpackStream(mergeConfig(webpackBaseConfig, config));
}

gulp.task("eslint", function()
{
  return gulp.src(["*.js", "*.json", "ui/**/*.js", "ui/**/*.vue", "lib/**/*.js",
                   "test/**/*.js", "test-lib/**/*.js", "web/**/*.js",
                   "contentScript/**/*.js", "worker/**/*.js",
                   "locale/**/*.json", "!ui/third-party/**"])
             .pipe(eslint())
             .pipe(eslint.format())
             .pipe(eslint.failAfterError());
});

gulp.task("htmlhint", function()
{
  return gulp.src(["ui/**/*.html", "web/**/*.html"])
             .pipe(htmlhint(".htmlhintrc"))
             .pipe(htmlhint.failReporter());
});

gulp.task("stylelint", function()
{
  return gulp.src(["ui/**/*.scss"])
             .pipe(stylelint({
               "failAfterError": true,
               "syntax": "scss",
               "reporters": [
                 {
                   "formatter": "string",
                   "console": true
                 }
               ]
             }));
});

gulp.task("validate", gulp.parallel("eslint", "htmlhint", "stylelint"));

function buildWorkers(targetdir)
{
  let resolveConfig = {};

  if (targetdir == "build-test/worker")
  {
    resolveConfig.alias = {
      "../lib/typedArrayConversion$": path.resolve(__dirname, "test-lib", "typedArrayConversion.js")
    };
  }

  return merge(
    gulp.src(["worker/pbkdf2.js"])
        .pipe(webpack({
          output: {
            filename: "pbkdf2.js",
            pathinfo: true
          },
          resolve: resolveConfig
        }))
        .pipe(gulp.dest(`${targetdir}`)),
    gulp.src(["worker/scrypt.js"])
        .pipe(webpack({
          output: {
            filename: "scrypt.js",
            pathinfo: true
          },
          resolve: resolveConfig
        }))
        .pipe(gulp.dest(`${targetdir}`))
  );
}

function buildCommon(targetdir)
{
  return merge(
    gulp.src("LICENSE.txt")
        .pipe(gulp.dest(`${targetdir}`)),
    gulp.src(["ui/**/*.html", "ui/**/*.png", "ui/**/*.svg"])
        .pipe(gulp.dest(`${targetdir}/ui`)),
    gulp.src("ui/third-party/**")
        .pipe(gulp.dest(`${targetdir}/ui/third-party`)),
    gulp.src(["contentScript/fillIn.js"])
        .pipe(webpack({
          output: {
            filename: "fillIn.js",
            pathinfo: true
          }
        }))
        .pipe(gulp.dest(`${targetdir}/contentScript`)),
    gulp.src("ui/panel/main.js")
        .pipe(webpack({
          output: {
            filename: "panel.js",
            pathinfo: true,
            library: "__webpack_require__"
          }
        }))
        .pipe(gulp.dest(`${targetdir}/ui/panel`)),
    gulp.src("ui/allpasswords/main.js")
        .pipe(webpack({
          output: {
            filename: "allpasswords.js",
            pathinfo: true,
            library: "__webpack_require__"
          }
        }))
        .pipe(gulp.dest(`${targetdir}/ui/allpasswords`)),
    gulp.src("ui/options/main.js")
        .pipe(webpack({
          output: {
            filename: "options.js",
            pathinfo: true,
            library: "__webpack_require__"
          }
        }))
        .pipe(gulp.dest(`${targetdir}/ui/options`)),
    gulp.src(["ui/**/*.scss"])
        .pipe(sass())
        .pipe(gulp.dest(`${targetdir}/ui`)),
    gulp.src("locale/**/*.json")
        .pipe(utils.combineLocales())
        .pipe(utils.toChromeLocale())
        .pipe(gulp.dest(`${targetdir}/_locales`)),
    gulp.src("lib/main.js")
        .pipe(webpack({
          output: {
            filename: "background.js",
            pathinfo: true,
            library: "__webpack_require__"
          }
        }))
        .pipe(gulp.dest(`${targetdir}`)),
    gulp.src(["lib/reloader.js"])
        .pipe(gulp.dest(`${targetdir}`)),
    buildWorkers(`${targetdir}/worker`)
  );
}

function touchReloader(targetdir)
{
  fs.writeFileSync(path.join(targetdir, "random.json"), Math.random());
}

function removeReloader(data)
{
  let index = data.background.scripts.indexOf("reloader.js");
  if (index >= 0)
    data.background.scripts.splice(index, 1);
}

gulp.task("build-chrome", gulp.series("validate", function buildChrome()
{
  let stream = merge(
    buildCommon("build-chrome"),
    gulp.src("manifest.json")
        .pipe(utils.jsonModify(data =>
        {
          delete data.applications;
        }))
        .pipe(gulp.dest("build-chrome"))
  );
  stream.on("finish", () => touchReloader("build-chrome"));
  return stream;
}));

gulp.task("watch-chrome", gulp.series("build-chrome", function watchChrome()
{
  gulp.watch(["*.js", "*.json", "ui/**/*", "lib/**/*", "contentScript/**/*", "worker/**/*", "locale/**/*"], ["build-chrome"]);
}));

gulp.task("build-firefox", gulp.series("validate", function buildFirefox()
{
  let stream = merge(
    buildCommon("build-firefox"),
    gulp.src("manifest.json")
        .pipe(utils.jsonModify(data =>
        {
          delete data.minimum_chrome_version;
          delete data.minimum_opera_version;
          delete data.background.persistent;

          data.browser_action.browser_style = false;
        }))
        .pipe(gulp.dest("build-firefox"))
  );
  stream.on("finish", () => touchReloader("build-firefox"));
  return stream;
}));

gulp.task("build-test", gulp.series("validate", function buildTest()
{
  return buildWorkers("build-test/worker");
}));

gulp.task("watch-firefox", gulp.series("build-firefox", function watchFirefox()
{
  gulp.watch(["*.js", "*.json", "ui/**/*", "lib/**/*", "contentScript/**/*", "worker/**/*", "locale/**/*"], ["build-firefox"]);
}));

gulp.task("build-web-locales", function buildWebLocales()
{
  return gulp.src("locale/**/*.json")
      .pipe(utils.combineLocales())
      .pipe(gulp.dest("build-web/locale"));
});

gulp.task("build-web", gulp.series("validate", "build-web-locales", function buildWeb()
{
  let targetdir = "build-web";
  return merge(
    gulp.src("LICENSE.txt")
        .pipe(gulp.dest(targetdir)),
    gulp.src(["ui/images/**"])
        .pipe(gulp.dest(`${targetdir}/images`)),
    gulp.src("ui/third-party/**")
        .pipe(gulp.dest(`${targetdir}/third-party`)),
    gulp.src(["ui/**/*.scss", "!ui/options/options.scss"])
        .pipe(sass())
        .pipe(gulp.dest(targetdir)),
    gulp.src("lib/main.js")
        .pipe(webpack({
          output: {
            filename: "background.js",
            pathinfo: true,
            library: "__webpack_require__"
          },
          module: {
            rules: [
              {
                test: /\/(scrypt|pbkdf2)\.js$/,
                use: path.resolve(__dirname, "workerLoader.js")
              },
              {
                test: /\.js$/,
                use: {
                  loader: "babel-loader",
                  options: {
                    presets: ["@babel/preset-env"]
                  }
                }
              }
            ]
          },
          resolve: {
            alias: {
              "./browserAPI$": path.resolve(__dirname, "web", "backgroundBrowserAPI.js"),
              "../browserAPI$": path.resolve(__dirname, "web", "backgroundBrowserAPI.js")
            }
          }
        }))
        .pipe(gulp.dest(targetdir)),
    gulp.src("web/index.js")
        .pipe(webpack({
          output: {
            filename: "index.js",
            pathinfo: true,
            library: "__webpack_require__"
          },
          module: {
            rules: [
              {
                test: /\.js$/,
                use: {
                  loader: "babel-loader",
                  options: {
                    presets: ["@babel/preset-env"]
                  }
                }
              }
            ]
          },
          resolve: {
            alias: {
              "./browserAPI$": path.resolve(__dirname, "web", "contentBrowserAPI.js"),
              "../browserAPI$": path.resolve(__dirname, "web", "contentBrowserAPI.js"),
              "locale$": path.resolve(__dirname, "build-web", "locale", "en_US.json")
            }
          }
        }))
        .pipe(gulp.dest(targetdir)),
    gulp.src("web/**/*.scss")
        .pipe(sass())
        .pipe(gulp.dest(targetdir)),
    gulp.src("web/**/*.html")
        .pipe(gulp.dest(targetdir))
  );
}));

gulp.task("crx", gulp.series("build-chrome", function buildCRX()
{
  let manifest = require("./manifest.json");
  return merge(
    gulp.src([
      "build-chrome/**",
      "!build-chrome/manifest.json", "!build-chrome/reloader.js", "!build-chrome/random.json",
      "!build-chrome/**/.*", "!build-chrome/**/*.zip", "!build-chrome/**/*.crx"
    ]),
    gulp.src("build-chrome/manifest.json").pipe(utils.jsonModify(removeReloader))
  ).pipe(zip("pfp-" + manifest.version + ".zip")).pipe(gulp.dest("build-chrome"));
}));

gulp.task("xpi", gulp.series("build-firefox", function buildXPI()
{
  let manifest = require("./manifest.json");
  return merge(
    gulp.src([
      "build-firefox/**",
      "!build-firefox/manifest.json", "!build-firefox/reloader.js", "!build-firefox/random.json",
      "!build-firefox/**/.*", "!build-firefox/**/*.xpi"
    ]),
    gulp.src("build-firefox/manifest.json").pipe(utils.jsonModify(removeReloader))
  ).pipe(zip("pfp-" + manifest.version + ".xpi")).pipe(gulp.dest("build-firefox"));
}));

gulp.task("web", gulp.series("build-web", function zipWeb()
{
  let manifest = require("./manifest.json");
  return gulp.src([
    "build-web/**",
    "!build-web/**/.*", "!build-web/**/*.zip", "!build-web/locale/**"
  ]).pipe(zip("pfp-web-" + manifest.version + ".zip")).pipe(gulp.dest("build-web"));
}));

gulp.task("test", gulp.series("validate", "build-test", function doTest()
{
  let testFile = utils.readArg("--test=");
  if (!testFile)
    testFile = "**/*.js";
  else if (!testFile.endsWith(".js"))
    testFile += ".js";

  return gulp.src("test/" + testFile)
             .pipe(utils.runTests());
}));

gulp.task("clean", function()
{
  return del(["build-chrome", "build-firefox", "build-test", "build-web"]);
});

gulp.task("all", gulp.parallel("xpi", "crx", "web"));
gulp.task("default", gulp.parallel("all"));
