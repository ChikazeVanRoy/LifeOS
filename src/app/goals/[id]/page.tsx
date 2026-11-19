import { GoalDetail } from "@/components/goals/goal-detail";

// Goals belong to whoever is signed in, so none can be known at build time. The static host serves
// this one placeholder page for every goal address, and the page reads the real id from the URL.
export const dynamicParams = false;
export const generateStaticParams = () => [{ id: "_" }];

export default function Page() {
  return <GoalDetail />;
}
