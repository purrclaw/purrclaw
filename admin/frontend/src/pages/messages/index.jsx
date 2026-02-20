import React from "react";
import { useTable, List, DeleteButton, DateField } from "@refinedev/antd";
import { Table, Space, Typography, Tag } from "antd";
const { Text } = Typography;

const ROLE_COLORS = {
  user: "blue",
  assistant: "green",
  tool: "orange",
  system: "purple",
};

export function MessagesList() {
  const { tableProps } = useTable({ resource: "messages", syncWithLocation: true });

  return (
    <List>
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="id" title="#" width={60} />
        <Table.Column dataIndex="session_key" title="Session"
          render={(v) => <Text code style={{ fontSize: 11 }}>{v}</Text>} />
        <Table.Column dataIndex="role" title="Role" width={90}
          render={(v) => <Tag color={ROLE_COLORS[v] || "default"}>{v}</Tag>} />
        <Table.Column dataIndex="content" title="Content"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 480, fontSize: 12 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )} />
        <Table.Column dataIndex="created_at" title="Created" width={160}
          render={(v) => <DateField value={v} />} />
        <Table.Column title="Del" width={60}
          render={(_, r) => (
            <DeleteButton hideText size="small" recordItemId={r.id} />
          )} />
      </Table>
    </List>
  );
}
