export const getLogPath = () => `logs/${process.env.NODE_ENV === 'development' ? 'dev' : 'prod'}.log`;
