declare module "/@lib";
declare module "/@lib/*";

declare module "/@fonts" {
  const url: string;
  export default url;
}

declare module "/@fonts/*" {
  const url: string;
  export default url;
}
