const katex = require('./index');
const md = require('markdown-it')();

md.use(katex);

str = '```java\npublic class\n```'
latexStr = md.render(str);
console.log(latexStr)