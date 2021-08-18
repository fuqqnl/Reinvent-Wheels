const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

/**
 * 获取到文件的内容，并且转成ast-》获取import的deps依赖-> 转成es5
 * @param {string} file 文件路径
 * @return {
 *  file -> 文件名
 *  deps -> file中的import依赖项
 *  code -> 根据ast解析成es5格式字符串
 * }
 */
function getModuleInfo(file) {
    // 1.先把file内容读出来
    const body = fs.readFileSync(file, 'utf-8');
    // 2.代码字符串转化成AST语法树，进行语法分析
    const ast = parser.parse(body, {
        sourceType: 'module' //使用的是ESModule
    });
    const deps = {};
    // 3. 考虑找到import相关的项，遍历语法树的节点
    traverse(ast, {
        // visitor
        ImportDeclaration({node}) {
            // 对具体import相关的进行分析,遇到import节点的时候执行回调
            // console.log('import node::', node);
            const dirname = path.dirname(file);
            const absPath = path.join(dirname, node.source.value);
            deps[node.source.value] = absPath;
        }
    });

    // 4. es6 -> es5 的转化
    const {code} = babel.transformFromAst(ast, null, {
        presets: ['@babel/preset-env']
    });
    const moduleInfo = {file, deps, code};
    return moduleInfo;

}

// const info = getModuleInfo('../test/add.js');
// console.log('info>>>', info);

// 上面的是一个文件的解析过程。 但是真实的项目中，从一个入口文件进去后，其实会有很多层的import
// 所以需要进行递归解析。最终解析出的数据格式应该是这样的：
/**
    {
        '../test/add.js': {
            deps: { './b': '../test/b' },
            code: '"use strict";\n' +
                '\n' +
                'var _b = _interopRequireDefault(require("./b"));\n' +
                '\n' +
                'function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }\n' +
                '\n' +
                "var t1 = '1234';"
        },
        '../test/b.js': {
            deps: {},
            code: "...."
        }

    }  
    
    为什么要用这种格式？ 是因为最后在进行执行的时候，需要把这段生成的放入一个自执行函数，
    这个函数里面会有require的方法定义，并且用eval解析字符串进行执行。这里后面再看。

 */


/**
 temp 中间态格式：

 [
  {
    file: '../test/add.js',
    deps: { './b.js': '../test/b.js' },
    code: '"use strict";\n' +
      '\n' +
      'var _b = _interopRequireDefault(require("./b.js"));\n' +
      '\n' +
      'function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }\n' +
      '\n' +
      "var t1 = '1234';\n" +
      '\n' +
      '_b["default"].b();'
  },
  {
    file: '../test/b.js',
    deps: {},
    code: '"use strict";\n' +
      '\n' +
      'Object.defineProperty(exports, "__esModule", {\n' +
      '  value: true\n' +
      '});\n' +
      'exports["default"] = void 0;\n' +
      'var _default = {\n' +
      '  b: function b() {\n' +
      "    console.log('b.js执行');\n" +
      '  }\n' +
      '};\n' +
      'exports["default"] = _default;'
  }
]

 */

/**
 * 将file中存在的各个import项也拿出来递归走getModuleInfo的程序
 * @param {string} file 
 */
function parseModules(file) {
    const entry = getModuleInfo(file);
    const temp = [entry];
    // 最终要产出的数据
    const depsGraph = {};
    getDepsData(temp, entry);
    // 将中间态数据转换成最终数据
    temp.forEach(item => {
        depsGraph[item.file] = {
            deps: item.deps,
            code: item.code
        }
    })
    return depsGraph;
}

/**
 * 
 * @param {Array} temp 保存数据[]
 * @param {Object} deps 依赖对象 
 */
function getDepsData(temp, {deps}) {
    Object.keys(deps).forEach(key => {
        const child = getModuleInfo(deps[key]);
        temp.push(child);
        getDepsData(temp, child);
    })
}




// 最后一步， 要创建一个自执行函数。 从返回的数据中，可以看到其中不能直接运行的是 require(xxxx)
// 和 exports
// 从这里，也能看到：通过label解析后的，是一个commonjs规范的代码

// 这里的核心逻辑是一个自执行函数
// const resInfo = parseModules('../test/add.js');
// console.log('resInfo...', resInfo);
/*
funciton bundle(file) {
    (function(info) {
        function require(file) {
            // 获取到info中的code， 并且eval执行它，
            // 当走到require的时候，就递归调用require函数
            eval(info.code)

        }
        // 首次的时候执行入口代码
        require(file);
    })(resInfo)
}
*/

function bundle(file) {
    const moduleInfo = JSON.stringify(parseModules(file));
    return `(function(graph) {
        function require(file) {
            const absRequire = (relPath) => {
                return require(graph[file].deps[relPath]);
            }
            let exports = {};
            (function(require, exports, code) {
                eval(code);
            })(absRequire, exports, graph[file].code);
            return exports;
        }
        require('${file}');
    })(${moduleInfo});`
}

const bundleResult = bundle('../test/add.js');
console.log('bundleResult>>>>>', bundleResult);

// 把数据写入bundle.js
if(!fs.existsSync('../dist')) {
    fs.mkdirSync('../dist');
}
fs.writeFileSync('../dist/bundle.js', bundleResult);


