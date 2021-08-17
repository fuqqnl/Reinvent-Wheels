const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

/**
 * 
 * @param {string} file 文件路径 
 */
function getModuleInfo(file) {
    // 1.找到哪些import的语句
    const body = fs.readFileSync(file, 'utf-8');
    // 2.代码字符串转化成AST语法树，进行语法分析
    const ast = parser.parse(body, {
        sourceType: 'module' //使用的是ESModule
    });
    console.log('ast....', ast);
    const deps = {};
    // 3. 考虑找到import相关的项，遍历语法树的节点
    traverse(ast, {
        // visitor
        ImportDeclaration({node}) {
            // 对具体import相关的进行分析,遇到import节点的时候执行回调
            // console.log('import node::', node);
            const dirname = path.dirname(file);
            console.log('dirname:', dirname);
            const absPath = path.join(dirname, node.source.value);
            console.log('absPath....', absPath);
            deps[node.source.value] = absPath;
        }
    });

    // es6 -> es5 的转化
    const {code} = babel.transformFromAst(ast, null, {
        presets: ['@babel/preset-env']
    });
    const moduleInfo = {file, deps, code};
    return moduleInfo;

}

const info = getModuleInfo('../test/add.js');
console.log('info>>>', info);