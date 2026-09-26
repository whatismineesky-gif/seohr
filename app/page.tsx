import { redirect } from "next/navigation";

import { getChatGPTUser } from "./chatgpt-auth";
import PeopleOSClient from "./people-os-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) redirect("/login");

  return <PeopleOSClient />;
}
