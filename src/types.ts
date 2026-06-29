export type JobStatus =
  | "Open"
  | "Funded"
  | "Delivered"
  | "Completed"
  | "Disputed"
  | "Refunded";

export type ServiceJob = {
  id: number;
  title: string;
  client: string;
  provider: string;
  evaluator: string;
  amount: number;
  deadline: string;
  createdAt: string;
  status: JobStatus;
  description: string;
  deliverable?: string;
  deliverableHash?: string;
  txHash?: string;
};

export type Toast = {
  type: "success" | "error" | "info";
  message: string;
};
