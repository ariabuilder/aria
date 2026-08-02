export { AriaStudioLive } from "../../worker/studio-live";

export default {
  fetch(): Response {
    return new Response("Runtime stability test worker");
  },
};
