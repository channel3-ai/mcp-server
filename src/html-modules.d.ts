// Wrangler's Text rule turns imported .html into a string module.
declare module "*.html" {
	const content: string;
	export default content;
}
