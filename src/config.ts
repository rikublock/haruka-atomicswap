export type Config = {
  isTesting: boolean;
  btc: {
    host: string;
    port: number | string;
    username: string;
    password: string;
  };
  xrp: {
    url: string;
  };
};

const isTesting = process.env.NODE_ENV === "test";

const DEFAULT: Config = {
  isTesting,
  btc: {
    host: "localhost",
    port: 18443,
    username: "haruka",
    password: "password",
  },
  xrp: {
    url: "wss://s.altnet.rippletest.net:51233/",
  },
};

const config: Config = DEFAULT;

export default config;
