const path = require('path')
const CopyPlugin = require("copy-webpack-plugin");
const HtmlPlugin = require("html-webpack-plugin");
const autoprefixer = require('autoprefixer');
const tailwindcss = require('tailwindcss')

module.exports = {
    entry:{
        popup:path.resolve('./src/popup/index.tsx'),
        background:path.resolve('./src/background/background.ts'),
        util:path.resolve('./src/background/util.ts'),
        contentScript:path.resolve('./src/contentScript/contentScript.tsx'),
        contentLoginPortal:path.resolve('./src/contentScript/contentLoginPortal.tsx'),
        contentCms:path.resolve('./src/contentScript/contentCms.tsx'),
        contentMy:path.resolve('./src/contentScript/contentMy.tsx'),
        mainScript:path.resolve('./src/contentScript/mainScript.tsx'),
    },
    module:{
        rules:[
            {
                use:"ts-loader",
                test:/\.(tsx|ts)$/,
                exclude:/node_modules/
            },
            {
                use:["style-loader","css-loader",{
                    loader:'postcss-loader',
                    options:{
                        postcssOptions:{
                            ident:'postcss',
                            plugins:[tailwindcss,autoprefixer]
                        }
                    }
                }],
                test:/\.css$/i,

            },{
                type:'asserts/resource',
                use:'assert/resource',
                test:/\.(png|jpg|jpeg)$/
            }
        ]
    },
    resolve:{
        extensions:['.tsx','.ts','.js'],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
        //   { from: path.resolve("src/popup/popup.tsx"), to: path.resolve("dist") },
          { from: path.resolve("src/static"), to: path.resolve("dist") },
        ],
      }),
      ...getHtmlPlugins(['popup']),
    ],
    output:{
        filename:'[name].js'
    },
    optimization: {
        splitChunks: {
          // include all types of chunks
          chunks: 'all',
        },
      },
  };

  function getHtmlPlugins(chunks) {
    return chunks.map(chunks=>new HtmlPlugin({
        title:'React Extension',
        filename: `${chunks}.html`,
        chunks:[chunks]
    }))
    
  }