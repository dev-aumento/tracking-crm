import { getMongoDb } from "../queries/mongo";
import { getCollection, updateById } from "../queries/mongo";
import { Collections } from "@db/mongo/collections";
import type { UserDoc } from "@db/mongo/types";

const ALL_COLLECTIONS = Object.values(Collections);

export async function ensureCollections() {
  const db = await getMongoDb();
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name),
  );

  for (const name of ALL_COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`[mongo] Created collection: ${name}`);
    }
  }
}

export async function ensureIndexes() {
  const db = await getMongoDb();

  const specs: Array<{
    name: string;
    indexes: Array<{ key: Record<string, 1 | -1>; unique?: boolean; sparse?: boolean }>;
  }> = [
    {
      name: Collections.users,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { email: 1 }, unique: true, sparse: true },
        { key: { unionId: 1 }, unique: true },
      ],
    },
    {
      name: Collections.employeeInvites,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { token: 1 }, unique: true },
      ],
    },
    {
      name: Collections.employees,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { userId: 1 }, unique: true },
        { key: { email: 1 }, unique: true },
        { key: { inviteId: 1 }, sparse: true },
      ],
    },
    { name: Collections.projects, indexes: [{ key: { id: 1 }, unique: true }] },
    {
      name: Collections.projectMembers,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { projectId: 1, userId: 1 }, unique: true },
        { key: { userId: 1 } },
      ],
    },
    {
      name: Collections.tasks,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { projectId: 1 } }],
    },
    {
      name: Collections.taskParticipants,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { taskId: 1, userId: 1 }, unique: true }],
    },
    { name: Collections.subtasks, indexes: [{ key: { id: 1 }, unique: true }, { key: { taskId: 1 } }] },
    { name: Collections.taskTags, indexes: [{ key: { id: 1 }, unique: true }, { key: { name: 1 }, unique: true }] },
    { name: Collections.taskTagRelations, indexes: [{ key: { id: 1 }, unique: true }, { key: { taskId: 1 } }] },
    {
      name: Collections.timeEntries,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { userId: 1 } }],
    },
    {
      name: Collections.taskActivity,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { taskId: 1 } }],
    },
    { name: Collections.taskAttachments, indexes: [{ key: { id: 1 }, unique: true }] },
    {
      name: Collections.notifications,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { userId: 1 } }],
    },
    {
      name: Collections.workSessions,
      indexes: [{ key: { id: 1 }, unique: true }, { key: { userId: 1, active: 1 } }],
    },
    {
      name: Collections.workBreaks,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { userId: 1, startTime: -1 } },
        { key: { workSessionId: 1 } },
      ],
    },
    {
      name: Collections.timeApprovalRequests,
      indexes: [
        { key: { id: 1 }, unique: true },
        { key: { userId: 1, status: 1 } },
        { key: { workSessionId: 1, type: 1, status: 1 } },
        { key: { workBreakId: 1, status: 1 } },
      ],
    },
  ];

  for (const { name, indexes } of specs) {
    const col = db.collection(name);
    for (const index of indexes) {
      const options: { unique?: boolean; sparse?: boolean } = {};
      if (index.unique) options.unique = true;
      if (index.sparse) options.sparse = true;
      await col.createIndex(index.key, options);
    }
  }
}

export async function bootstrapMongo() {
  await ensureCollections();
  await ensureIndexes();
  await ensureEmployeeProjectViewPermission();
}

async function ensureEmployeeProjectViewPermission() {
  const col = await getCollection<UserDoc>(Collections.users);
  const employees = await col.find({ role: "employee" }).toArray();

  for (const employee of employees) {
    if (employee.permissions?.includes("projects.view")) continue;
    await updateById<UserDoc>(Collections.users, employee.id, {
      permissions: [...(employee.permissions ?? []), "projects.view"],
      updatedAt: new Date(),
    });
  }
}
