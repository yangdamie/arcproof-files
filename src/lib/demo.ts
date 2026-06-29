import type { ServiceJob } from "../types";

const today = new Date();
const plusDays = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString();

export const demoJobs: ServiceJob[] = [
  {
    id: 1042,
    title: "Landing page and brand system",
    client: "0xA7d1…6cB2",
    provider: "0x5e8C…A439",
    evaluator: "0xA7d1…6cB2",
    amount: 180,
    deadline: plusDays(4),
    createdAt: plusDays(-3),
    status: "Delivered",
    description: "Design and implement a responsive launch page with a compact brand kit.",
    deliverable: "ipfs://bafybeigdemo-arcproof-landing-deliverable",
    deliverableHash: "0x7d19f0d54f690efa3b938f6762c6c99e11df55df5074a1d4d57fa211bbfa9d30",
  },
  {
    id: 1041,
    title: "Smart contract security review",
    client: "0xA7d1…6cB2",
    provider: "0xC03F…1e91",
    evaluator: "0x5C00…aB98",
    amount: 420,
    deadline: plusDays(2),
    createdAt: plusDays(-5),
    status: "Funded",
    description: "Review a small payment contract and provide a prioritized remediation report.",
  },
  {
    id: 1040,
    title: "Creator launch video package",
    client: "0x13a0…D2e0",
    provider: "0x5e8C…A439",
    evaluator: "0x13a0…D2e0",
    amount: 95,
    deadline: plusDays(-2),
    createdAt: plusDays(-9),
    status: "Completed",
    description: "Three short video edits for a product launch sequence.",
    deliverable: "https://drive.example/arcproof-video-package",
    deliverableHash: "0x1000dd57d11a9aa4a1b94a073dce7abfe762a897c1be9d63dccf1f6f2a7d2c01",
  },
  {
    id: 1039,
    title: "Growth research sprint",
    client: "0x8b90…91f1",
    provider: "0xC03F…1e91",
    evaluator: "0x8b90…91f1",
    amount: 150,
    deadline: plusDays(6),
    createdAt: plusDays(-1),
    status: "Open",
    description: "Prepare a competitor landscape and first-30-days growth experiment plan.",
  },
];
