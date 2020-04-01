define('c', ['b'], function() {
    console.log('c模块加载了，也执行了')
    return {
        ccc: 666
    }
});