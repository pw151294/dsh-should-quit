export default defineAppConfig({
  pages: ['pages/launch/index', 'pages/baseline/index', 'pages/home/index', 'pages/trend/index', 'pages/advisor/index', 'pages/chat/index', 'pages/mine/index'],
  window: { navigationBarTitleText: '该溜吗', navigationBarBackgroundColor: '#fafafa', navigationBarTextStyle: 'black' },
  networkTimeout: { request: 320000 },
  tabBar: { color: '#555555', selectedColor: '#8a4b00', list: [
    { pagePath: 'pages/home/index', text: '首页' }, { pagePath: 'pages/trend/index', text: '趋势' },
    { pagePath: 'pages/advisor/index', text: '顾问' }, { pagePath: 'pages/mine/index', text: '我的' },
  ] },
})
