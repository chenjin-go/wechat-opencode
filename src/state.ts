import { join } from "path"
import { AccountState, ProjectState, RuntimeState } from "./types"

export class StateStore {
  constructor(private dir: string) {}

  private path(name: string): string {
    return join(this.dir, `${name}.json`)
  }

  async getAccount(): Promise<AccountState | null> {
    return this.read<AccountState>("account")
  }

  async setAccount(data: AccountState): Promise<void> {
    return this.write("account", data)
  }

  async getProject(): Promise<ProjectState | null> {
    return this.read<ProjectState>("project")
  }

  async setProject(data: ProjectState): Promise<void> {
    return this.write("project", data)
  }

  async getRuntime(): Promise<RuntimeState | null> {
    return this.read<RuntimeState>("runtime")
  }

  async setRuntime(data: RuntimeState): Promise<void> {
    return this.write("runtime", data)
  }

  private async read<T>(name: string): Promise<T | null> {
    const file = Bun.file(this.path(name))
    const exists = await file.exists()
    if (!exists) return null
    return JSON.parse(await file.text()) as T
  }

  private async write<T>(name: string, data: T): Promise<void> {
    await Bun.write(this.path(name), JSON.stringify(data, null, 2))
  }
}
