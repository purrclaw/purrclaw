import React from "react";
import {
  useTable,
  List,
  CreateButton,
  EditButton,
  DeleteButton,
  DateField,
  Create,
  Edit,
  useForm,
} from "@refinedev/antd";
import { Table, Input, Space, Typography, Form } from "antd";

const { Text } = Typography;

export function MemoryList() {
  const [search, setSearch] = React.useState("");
  const { tableProps, setFilters } = useTable({
    resource: "memory",
    sorters: { initial: [{ field: "updated_at", order: "desc" }] },
    syncWithLocation: true,
  });

  React.useEffect(() => {
    const next = search.trim() ? [{ field: "q", operator: "eq", value: search.trim() }] : [];
    setFilters(next, "replace");
  }, [search, setFilters]);

  return (
    <List
      headerButtons={
        <Space>
          <Input.Search allowClear placeholder="Search memory" onSearch={setSearch} style={{ width: 260 }} />
          <CreateButton />
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="key" title="Key" width={260} sorter render={(v) => <Text code>{v}</Text>} />
        <Table.Column
          dataIndex="value"
          title="Value"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 420 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )}
        />
        <Table.Column dataIndex="updated_at" title="Updated" width={160} sorter render={(v) => <DateField value={v} />} />
        <Table.Column
          title="Actions"
          width={100}
          render={(_, r) => (
            <Space>
              <EditButton hideText size="small" recordItemId={r.id} />
              <DeleteButton hideText size="small" recordItemId={r.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}

export function MemoryCreate() {
  const { formProps, saveButtonProps } = useForm({ resource: "memory", redirect: "list" });
  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Key" name="key" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Value" name="value" rules={[{ required: true }]}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Create>
  );
}

export function MemoryEdit() {
  const { formProps, saveButtonProps, query } = useForm({ resource: "memory", redirect: "list" });
  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Key">
          <Input value={query?.data?.data?.key} disabled />
        </Form.Item>
        <Form.Item label="Value" name="value" rules={[{ required: true }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
      </Form>
    </Edit>
  );
}
