// 闭包，除了define暴露在window上，其余都不可直接访问
~(function() {
    // 模块缓存， 记录已经加载过的模块信息
    const module_catch = {};

    // 依赖关系散列表，用于存储所有模块依赖关系
    const modRefMap = {};

    const MODULE_STATUS = {
        LOADING: 'loading', // 模块加载中
        LOADED: 'loaded' // 模块加载完成，已被缓存
    };

    // 校验抛错
    const throwErrow = err => { throw new Error(err) }

    // 加载脚本
    const loadScript = src => {
        const _script = document.createElement("script");
        _script.type = "text/javascript";
        _script.charset = "UTF-8";
        _script.async = true;
        _script.src = src;
        _script.onerror = err => throwErrow(err);
        document.getElementsByTagName("head")[0].appendChild(_script);
    };

    // 获取文件路径, 补全扩展名
    const getUrl = moduleName => String(moduleName).replace(/\.js$/g, "") + ".js";

    // 获取当前页面名称
    const getCurrentFileName = () => document.currentScript.src;

    // 将相对路径转成绝对路径 相当于nodejs  path.resolve(__dirname, './modules/a')
    const toAbsURL = (url) => {
        let currentArr = getCurrentFileName().split('/');
        currentArr.pop();

        function getRepeatNum(target, str) {
            if (target.startsWith(str)) {
                return target.split(str).length - 1;
            }
            return 0;
        }
        // currentArr此时为当前文件所在目录， 拆分的数组
        if (url.startsWith('../')) {
            // 需要判断返回几级
            let repeatNum = getRepeatNum(url, '../')
            let file = url.slice(3 * repeatNum);
            while (repeatNum > 0) {
                currentArr.pop();
                repeatNum--;
            }
            currentArr.push(file)
            return currentArr.join('/')
        } else if (url.startsWith('./')) {

            currentArr.push(url.slice(2))
            return currentArr.join('/')
        } else if (url.startsWith('/')) {
            // 不支持根路径
            throw new Error('not support ROOT path')
        } else {
            currentArr.push(url)
            return currentArr.join('/')
        }
    }

    // loadedCallback 是模块加载完成后执行的回调
    const loadModule = (moduleId, loadedCallback) => {
        let _module;

        /* 如果缓存中没有该模块，说明此依赖第一次被加载，
           那么将依赖模块信息放到缓存中，且该模块是loading状态,
           只有此模块加载完成并且执行完，才会该状态
        */

        if (!module_catch[moduleId]) {
            module_catch[moduleId] = {
                moduleName: moduleId,
                status: MODULE_STATUS.LOADING,
                dependences: [],
                onload: [loadedCallback], // 因为此时还没有下载依赖，依赖是loading状态，所以只能将回调储存起来，等加载完再执行
                exports: null // 因为此时既没有下载依赖也没有执行依赖，所以导出依赖的导出此时是null
            };

            /* 依赖a真正被加载: 在这之前，define发现有依赖，遍历依赖，调用了loadModule传入依赖，
                发现没有缓存，于是loadScript请求加载模块，
                加载完成后，加载过的依赖文件a中又执行了一遍define。这可以理解为间接的递归
            */
            loadScript(getUrl(moduleId));
        } else {
            _module = module_catch[moduleId];
            if (_module.status === MODULE_STATUS.LOADED) {
                setTimeout(cb(module.exports), 0);
            } else {
                _module.onload.push(loadedCallback);
            }
        }
    };

    const setModule = (moduleId, deps, cb) => {
        let _module, loadModuleCb;

        if (module_catch[moduleId]) {
            _module = module_catch[moduleId];
            _module.status = MODULE_STATUS.LOADED;

            // a模块的导出 ，就是a的cb执行结果返回值
            _module.exports = cb.apply(_module, deps);

            // 这是应该去运行之前缓存的onload中缓存的函数，即loadModule的callback了

            while (_module.onload.length > 0) {
                loadModuleCb = _module.onload.shift();
                loadModuleCb(_module.exports)

            }
        } else {
            cb.apply(null, deps);
        }
    };

    // url = "", dependence = [], cb
    window.define = (...params) => {
        // 最后一个是必选参数，callback
        const cb = params.pop();

        // 倒数第二个参数是依赖数组
        let deps = [];
        // 倒数第三个参数是模块标识id， 用于查找缓存
        let moduleId = '';

        if (!cb || typeof cb !== 'function') {
            throwErrow('last param must be a function!');
        }

        if (params.length > 2) {
            throwErrow('can not use more than 3 params！');
        }

        // (moduleId, deps[], cb) 类型  如果写第一个参数，必须是当前文件名
        if (params.length === 2 && params[1] instanceof Array && typeof params[0] === 'string') {
            deps = params.pop();
            moduleId = getUrl(toAbsURL(params.pop())); // 应该是当前脚本文件名，如：a, 如果不是，则抛错
            if (moduleId !== getCurrentFileName()) throwErrow('module name must be current filename！')
        } else if (params.length === 1 && params[0] instanceof Array) {
            // (deps[], cb) 类型
            deps = params.pop();
            // 模块id没有传的话，默认为文件路径名
            moduleId = getCurrentFileName();
        } else if (params.length === 1 && typeof params[0] === 'string') {
            // (moduleId, cb) 类型
            deps = [];
            moduleId = getUrl(toAbsURL(params.pop()));
            if (moduleId !== getCurrentFileName()) throwErrow('module name must be current filename！')
        } else if (params.length === 0) {
            deps = [];
            moduleId = getCurrentFileName();
        } else {
            throwErrow('param error');
        }

        // 处理依赖的模块Id, 模块名是相对路径，需要转成绝对路径，作为模块id
        const dependences = deps.map(relativeUrl => getUrl(toAbsURL(relativeUrl)))

        // 预检查，处理以来前先校验引用关系
        ~(() => {
            modRefMap[moduleId] = dependences;
            // 先看哪些模块的依赖包含当前moduleId，找到这些模块
            const inclueCurrent = [];
            for (let mod of Object.keys(modRefMap)) {
                if (modRefMap[mod].indexOf(moduleId) !== -1) {
                    inclueCurrent.push(mod)
                }
            }
            //再检查当前模块的所有依赖，是否在inclueCurrent中，有就抛错
            let intersect = dependences.filter(dep => inclueCurrent.indexOf(dep) !== -1)
            if (intersect.length > 0) {
                throwErrow(`${String(intersect)} module have conflict with current module！`)
            }
        })()

        // 未加载的模块序列
        let unloadModules = [];
        // 未加载的模块数量
        let unloadModuleNum = 0;

        // 依赖模块序列长度
        let depNum = dependences.length;

        // 如果当前模块有依赖，则先去加载每个依赖，拿到依赖模块的执行结果
        if (depNum > 0) {
            // 模块有依赖
            for (let i = 0; i < depNum; ++i) {
                unloadModuleNum++;
                loadModule(dependences[i], mod => { //mod是a模块执行结果，导出
                    unloadModules[i] = mod;
                    unloadModuleNum--;
                    if (unloadModuleNum === 0) {
                        // 将amd的模块都加载完了，就将自身的模块amd的模块id注册进入缓存，并执行回调
                        setModule(moduleId, unloadModules, cb);
                    }
                });
            }
        } else {
            // a在这执行，因为没有a没有依赖，所以第二个参数传 []     a exports = cb()
            setModule(moduleId, [], cb);
        }
    };
})();

define(['modules/a'], (...rest) => {
    console.log("finish", rest);
});